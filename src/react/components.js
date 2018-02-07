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
import {
  ECMAScriptSourceFunctionValue,
  AbstractValue,
  ObjectValue,
  AbstractObjectValue,
  SymbolValue,
} from "../values/index.js";
import * as t from "babel-types";
import type { BabelNodeIdentifier } from "babel-types";
import { valueIsClassComponent } from "./utils";
import { ExpectedBailOut, SimpleClassBailOut } from "./errors.js";
import { Get, Construct } from "../methods/index.js";
import { Properties } from "../singletons.js";
import invariant from "../invariant.js";
import type { ClassComponentMetadata } from "../types.js";

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
  componentType: ECMAScriptSourceFunctionValue | null
): AbstractObjectValue {
  let propsName = null;
  if (componentType !== null) {
    if (valueIsClassComponent(realm, componentType)) {
      propsName = "this.props";
    } else {
      // otherwise it's a functional component, where the first paramater of the function is "props" (if it exists)
      if (componentType.$FormalParameters.length > 0) {
        let firstParam = componentType.$FormalParameters[0];
        if (t.isIdentifier(firstParam)) {
          propsName = ((firstParam: any): BabelNodeIdentifier).name;
        }
      }
    }
  }
  let value = AbstractValue.createAbstractObject(realm, propsName || "props");
  invariant(value instanceof AbstractObjectValue);
  return value;
}

export function getInitialContext(realm: Realm, componentType: ECMAScriptSourceFunctionValue): AbstractObjectValue {
  let contextName = null;
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
    }
  }
  let value = AbstractValue.createAbstractObject(realm, contextName || "context");
  return value;
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

function deeplyApplyInstancePrototypeProperties(
  realm: Realm,
  instance: ObjectValue,
  componentPrototype: ObjectValue,
  classMetadata: ClassComponentMetadata
) {
  let { instanceProperties, instanceSymbols } = classMetadata;
  let proto = componentPrototype.$Prototype;

  if (proto instanceof ObjectValue && proto !== realm.intrinsics.ObjectPrototype) {
    deeplyApplyInstancePrototypeProperties(realm, instance, proto, classMetadata);
  }

  for (let [name] of componentPrototype.properties) {
    // ensure we don't set properties that were defined on the instance
    if (name !== "constructor" && !instanceProperties.has(name)) {
      Properties.Set(realm, instance, name, Get(realm, componentPrototype, name), true);
    }
  }
  for (let [symbol] of componentPrototype.symbols) {
    // ensure we don't set symbols that were defined on the instance
    if (!instanceSymbols.has(symbol)) {
      Properties.Set(realm, instance, symbol, Get(realm, componentPrototype, symbol), true);
    }
  }
}

export function createClassInstance(
  realm: Realm,
  componentType: ECMAScriptSourceFunctionValue,
  props: ObjectValue | AbstractValue,
  context: ObjectValue | AbstractValue,
  classMetadata: ClassComponentMetadata
): AbstractObjectValue {
  let componentPrototype = Get(realm, componentType, "prototype");
  invariant(componentPrototype instanceof ObjectValue);
  // create an instance object and disable serialization as we don't want to output the internals we set below
  let instance = new ObjectValue(realm, componentPrototype, "this", true);
  deeplyApplyInstancePrototypeProperties(realm, instance, componentPrototype, classMetadata);

  // assign refs
  Properties.Set(realm, instance, "refs", AbstractValue.createAbstractObject(realm, "this.refs"), true);
  // assign props
  Properties.Set(realm, instance, "props", props, true);
  // assign context
  Properties.Set(realm, instance, "context", context, true);
  // enable serialization to support simple instance variables properties
  instance.refuseSerialization = false;
  // return the instance in an abstract object
  let value = AbstractValue.createAbstractObject(realm, "this", instance);
  invariant(value instanceof AbstractObjectValue);
  return value;
}

export function evaluateClassConstructor(
  realm: Realm,
  constructorFunc: ECMAScriptSourceFunctionValue,
  props: ObjectValue | AbstractObjectValue,
  context: ObjectValue | AbstractObjectValue
): { instanceProperties: Set<string>, instanceSymbols: Set<SymbolValue> } {
  let instanceProperties = new Set();
  let instanceSymbols = new Set();

  realm.evaluatePure(() =>
    realm.evaluateForEffects(
      () => {
        let instanceObject = Construct(realm, constructorFunc, [props, context]);
        invariant(instanceObject instanceof ObjectValue);
        for (let [propertyName] of instanceObject.properties) {
          instanceProperties.add(propertyName);
        }
        for (let [symbol] of instanceObject.symbols) {
          instanceSymbols.add(symbol);
        }
        return instanceObject;
      },
      /*state*/ null,
      `react component constructor: ${constructorFunc.getName()}`
    )
  );

  return {
    instanceProperties,
    instanceSymbols,
  };
}
