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
import { ECMAScriptSourceFunctionValue, AbstractValue, ObjectValue } from "../values/index.js";
import { flowAnnotationToObjectTypeTemplate } from "../flow/utils.js";
import * as t from "babel-types";
import type { BabelNodeIdentifier } from "babel-types";
import { createAbstractObject } from "../flow/abstractObjectFactories.js";
import { valueIsClassComponent } from "./utils";
import { ExpectedBailOut } from "./reconcilation.js";
import { Construct, Get, GetValue } from "../methods/index.js";
import { Properties } from "../singletons.js";
import invariant from "../invariant.js";

export function getInitialProps(
  realm: Realm,
  componentType: ECMAScriptSourceFunctionValue
): ObjectValue | AbstractValue {
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
  return createAbstractObject(realm, propsName, propTypes);
}

export function getInitialContext(
  realm: Realm,
  componentType: ECMAScriptSourceFunctionValue
): ObjectValue | AbstractValue {
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
  return createAbstractObject(realm, contextName, contextTypes);
}

function getRootPropertyNameAfterThis(object: BabelNode): string | null {
  while (t.isMemberExpression(object)) {
    if (t.isThisExpression(object.object)) {
      let property = object.property;

      if (t.isMemberExpression(property)) {
        return property.object.name;
      } else {
        return property.name;
      }
    }
    object = object.object;
  }
  return null;
}

function getNaiveInstanceAssignments(bodyNodes: Array<BabelNode>): Array<string> {
  let assignments = [];

  for (let bodyNode of bodyNodes) {
    if (t.isExpressionStatement(bodyNode)) {
      let expression = bodyNode.expression;

      if (t.isAssignmentExpression(expression) && expression.operator === "=") {
        let left = expression.left;

        if (t.isMemberExpression(left)) {
          let name = getRootPropertyNameAfterThis(left);
          if (name !== null) {
            assignments.push(name);
          }
        }
      }
    }
  }
  return assignments;
}

function createAbstract(realm: Realm, name: string): AbstractValue {
  const value = ((GetValue(
    realm,
    realm.$GlobalEnv.evaluate(
      t.callExpression(t.identifier("__abstractOrNullOrUndefined"), [
        t.stringLiteral("empty"),
        t.stringLiteral(`this.${name}`),
      ]),
      false
    )
  ): any): AbstractValue);
  return value;
}

export function createClassInstance(
  realm: Realm,
  componentType: ECMAScriptSourceFunctionValue,
  props: ObjectValue | AbstractValue,
  context: ObjectValue | AbstractValue
): ObjectValue {
  let componentPrototype = Get(realm, componentType, "prototype");
  invariant(componentPrototype instanceof ObjectValue);
  // we get the constructor body AST and keep a copy of it
  let constructorBody = componentType.$ECMAScriptCode.body;
  // we clear it the original node's body so there's no user code
  componentType.$ECMAScriptCode.body = [];
  // then create an instance without the user's constructor
  // we do this as we don't want to evaluate the user's code in the constructor
  let instance = Construct(realm, componentType, [props, context]);
  // then re-add the AST body back in so it gets serialized back in code
  componentType.$ECMAScriptCode.body = constructorBody;
  // we then need to find all naive cases of "this.something =" in the constructor AST
  let assignments = getNaiveInstanceAssignments(constructorBody);
  // using the assignments, we create abstracts for them all
  for (let assignment of assignments) {
    let abstractProperty = createAbstract(realm, assignment);
    Properties.Set(realm, instance, assignment, abstractProperty, true);
  }
  // assign state
  Properties.Set(realm, instance, "state", createAbstractObject(realm, "this.state", null), true);
  // assign refs
  Properties.Set(realm, instance, "refs", createAbstractObject(realm, "this.refs", null), true);
  // assign props
  Properties.Set(realm, instance, "props", props, true);
  // assign context
  Properties.Set(realm, instance, "context", context, true);
  // return the instance
  return instance;
}
