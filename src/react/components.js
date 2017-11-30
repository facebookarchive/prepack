/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

import { Realm } from "../realm.js";
import { ECMAScriptSourceFunctionValue, AbstractValue, ObjectValue, AbstractObjectValue } from "../values/index.js";
import { flowAnnotationToObjectTypeTemplate } from "../flow/utils.js";
import * as t from "babel-types";
import type { BabelNodeIdentifier } from "babel-types";
import { createAbstractObject, createAbstractObjectFromFlowTypes } from "../flow/abstractObjectFactories.js";
import { valueIsClassComponent } from "./utils";
import { ExpectedBailOut, SimpleClassBailOut } from "./errors.js";
import { Get } from "../methods/index.js";
import { Properties } from "../singletons.js";
import invariant from "../invariant.js";

const lifecycleMethods = new Set([
  "componentWillUnmount",
  "componentDidMount",
  "componentWillMount",
  "componentDidUpdate",
  "componentWillUpdate",
  "componentDidCatch",
  "componentWillReceiveProps",
]);

export function getInitialProps(
  realm: Realm,
  componentType: ECMAScriptSourceFunctionValue
): ObjectValue | AbstractObjectValue {
  let propsName = null;
  let propTypes = null;
  if (valueIsClassComponent(realm, componentType)) {
    propsName = "this.props";
    // if flow is not required, do not try to construct the object from Flow types
    if (realm.react.flowRequired) {
      // it's a class component, so we need to check the type on for props of the component prototype
      let superTypeParameters = componentType.$SuperTypeParameters;
      if (superTypeParameters !== undefined) {
        throw new ExpectedBailOut("props on class components not yet supported");
      }
    }
  } else {
    // otherwise it's a functional component, where the first paramater of the function is "props" (if it exists)
    if (componentType.$FormalParameters.length > 0) {
      let firstParam = componentType.$FormalParameters[0];
      if (t.isIdentifier(firstParam)) {
        propsName = ((firstParam: any): BabelNodeIdentifier).name;
      }
      // if flow is not required, do not try to construct the object from Flow types
      if (realm.react.flowRequired) {
        let propsTypeAnnotation = firstParam.typeAnnotation !== undefined && firstParam.typeAnnotation;
        // we expect that if there's a props paramater, it should always have Flow annotations
        if (!propsTypeAnnotation) {
          throw new ExpectedBailOut(`root component missing Flow type annotations for the "props" paramater`);
        }
        propTypes = flowAnnotationToObjectTypeTemplate(propsTypeAnnotation);
      }
    }
  }
  return createAbstractObjectFromFlowTypes(realm, propsName, propTypes);
}

export function getInitialContext(
  realm: Realm,
  componentType: ECMAScriptSourceFunctionValue
): ObjectValue | AbstractObjectValue {
  let contextName = null;
  let contextTypes = null;
  if (valueIsClassComponent(realm, componentType)) {
    // it's a class component, so we need to check the type on for context of the component prototype
    let superTypeParameters = componentType.$SuperTypeParameters;
    contextName = "this.context";

    if (superTypeParameters !== undefined) {
      throw new ExpectedBailOut("context on class components not yet supported");
    }
  } else {
    // otherwise it's a functional component, where the second paramater of the function is "context" (if it exists)
    if (componentType.$FormalParameters.length > 1) {
      let secondParam = componentType.$FormalParameters[1];
      if (t.isIdentifier(secondParam)) {
        contextName = ((secondParam: any): BabelNodeIdentifier).name;
      }
      let contextTypeAnnotation = secondParam.typeAnnotation !== undefined && secondParam.typeAnnotation;
      // we expect that if there's a context param, it should always have Flow annotations
      if (!contextTypeAnnotation) {
        throw new ExpectedBailOut(`root component missing Flow type annotations for the "context" paramater`);
      }
      contextTypes = flowAnnotationToObjectTypeTemplate(contextTypeAnnotation);
    }
  }
  return createAbstractObjectFromFlowTypes(realm, contextName, contextTypes);
}

export function createSimpleClassInstance(
  realm: Realm,
  componentType: ECMAScriptSourceFunctionValue,
  props: ObjectValue | AbstractValue,
  context: ObjectValue | AbstractValue
): AbstractObjectValue {
  let componentPrototype = Get(realm, componentType, "prototype");
  invariant(componentPrototype instanceof ObjectValue);
  // create an instance object and disable serialization as we don't want to output the internals we set below
  let instance = new ObjectValue(realm, componentPrototype, "this", true);
  let allowedPropertyAccess = new Set(["props", "context"]);
  for (let [name] of componentPrototype.properties) {
    if (lifecycleMethods.has(name)) {
      // this error will result in the simple class falling back to a complex class
      throw new SimpleClassBailOut("lifecycle methods are not supported on simple classes");
    } else if (name !== "constructor") {
      allowedPropertyAccess.add(name);
      Properties.Set(realm, instance, name, Get(realm, componentPrototype, name), true);
    }
  }
  // assign props
  Properties.Set(realm, instance, "props", props, true);
  // assign context
  Properties.Set(realm, instance, "context", context, true);
  // as this object is simple, we want to check if any access to anything other than
  // "this.props" or "this.context" or methods on the class occur
  let $GetOwnProperty = instance.$GetOwnProperty;
  instance.$GetOwnProperty = P => {
    if (!allowedPropertyAccess.has(P)) {
      // this error will result in the simple class falling back to a complex class
      throw new SimpleClassBailOut("access to basic class instance properties is not supported on simple classes");
    }
    return $GetOwnProperty.call(instance, P);
  };
  // enable serialization to support simple instance variables properties
  instance.refuseSerialization = false;
  // return the instance
  return instance;
}

export function createClassInstance(
  realm: Realm,
  componentType: ECMAScriptSourceFunctionValue,
  props: ObjectValue | AbstractValue,
  context: ObjectValue | AbstractValue
): AbstractObjectValue {
  let componentPrototype = Get(realm, componentType, "prototype");
  invariant(componentPrototype instanceof ObjectValue);
  // create an instance object and disable serialization as we don't want to output the internals we set below
  let instance = new ObjectValue(realm, componentPrototype, "this", true);
  for (let [name] of componentPrototype.properties) {
    if (name !== "constructor") {
      Properties.Set(realm, instance, name, Get(realm, componentPrototype, name), true);
    }
  }
  // assign state
  Properties.Set(realm, instance, "state", createAbstractObject(realm, "this.state", null), true);
  // assign refs
  Properties.Set(realm, instance, "refs", createAbstractObject(realm, "this.refs", null), true);
  // assign props
  Properties.Set(realm, instance, "props", props, true);
  // assign context
  Properties.Set(realm, instance, "context", context, true);
  // enable serialization to support simple instance variables properties
  instance.refuseSerialization = false;
  // return the instance in an abstract object
  return createAbstractObject(realm, "this", null, instance);
}
