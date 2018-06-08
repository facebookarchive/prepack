/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

import type { Realm } from "../../realm.js";
import { ObjectValue, AbstractObjectValue, AbstractValue, FunctionValue } from "../../values/index.js";
import { createReactHintObject, isReactElement } from "../../react/utils.js";
import * as t from "babel-types";
import invariant from "../../invariant";
import { updateIntrinsicNames, addMockFunctionToObject } from "./utils.js";
import { renderToString } from "../../react/experimental-server-rendering/rendering.js";

export function createMockReactDOM(realm: Realm, reactDomRequireName: string): ObjectValue {
  let reactDomValue = new ObjectValue(realm, realm.intrinsics.ObjectPrototype);
  reactDomValue.refuseSerialization = true;

  updateIntrinsicNames(realm, reactDomValue, reactDomRequireName);

  const genericTemporalFunc = (funcVal, args) => {
    let reactDomMethod = AbstractValue.createTemporalFromBuildFunction(
      realm,
      FunctionValue,
      [funcVal, ...args],
      ([renderNode, ..._args]) => t.callExpression(renderNode, ((_args: any): Array<any>)),
      { skipInvariant: true, isPure: true }
    );
    invariant(reactDomMethod instanceof AbstractObjectValue);
    return reactDomMethod;
  };

  addMockFunctionToObject(realm, reactDomValue, reactDomRequireName, "render", genericTemporalFunc);
  addMockFunctionToObject(realm, reactDomValue, reactDomRequireName, "hydrate", genericTemporalFunc);
  addMockFunctionToObject(realm, reactDomValue, reactDomRequireName, "findDOMNode", genericTemporalFunc);
  addMockFunctionToObject(realm, reactDomValue, reactDomRequireName, "unmountComponentAtNode", genericTemporalFunc);

  const createPortalFunc = (funcVal, [reactPortalValue, domNodeValue]) => {
    let reactDomMethod = AbstractValue.createTemporalFromBuildFunction(
      realm,
      ObjectValue,
      [funcVal, reactPortalValue, domNodeValue],
      ([renderNode, ..._args]) => t.callExpression(renderNode, ((_args: any): Array<any>)),
      { skipInvariant: true, isPure: true }
    );
    invariant(reactDomMethod instanceof AbstractObjectValue);
    realm.react.abstractHints.set(
      reactDomMethod,
      createReactHintObject(reactDomValue, "createPortal", [reactPortalValue, domNodeValue], realm.intrinsics.undefined)
    );
    return reactDomMethod;
  };

  addMockFunctionToObject(realm, reactDomValue, reactDomRequireName, "createPortal", createPortalFunc);

  reactDomValue.refuseSerialization = false;
  reactDomValue.makeFinal();
  return reactDomValue;
}

export function createMockReactDOMServer(realm: Realm, requireName: string): ObjectValue {
  let reactDomServerValue = new ObjectValue(realm, realm.intrinsics.ObjectPrototype);
  reactDomServerValue.refuseSerialization = true;

  updateIntrinsicNames(realm, reactDomServerValue, requireName);

  const genericTemporalFunc = (funcVal, args) => {
    let reactDomMethod = AbstractValue.createTemporalFromBuildFunction(
      realm,
      FunctionValue,
      [funcVal, ...args],
      ([renderNode, ..._args]) => t.callExpression(renderNode, ((_args: any): Array<any>)),
      { skipInvariant: true, isPure: true }
    );
    invariant(reactDomMethod instanceof AbstractObjectValue);
    return reactDomMethod;
  };

  addMockFunctionToObject(realm, reactDomServerValue, requireName, "renderToString", (funcVal, [input]) => {
    if (input instanceof ObjectValue && isReactElement(input)) {
      return renderToString(realm, input, false);
    }
    return genericTemporalFunc(funcVal, [input]);
  });
  addMockFunctionToObject(realm, reactDomServerValue, requireName, "renderToStaticMarkup", (funcVal, [input]) => {
    if (input instanceof ObjectValue && isReactElement(input)) {
      return renderToString(realm, input, true);
    }
    return genericTemporalFunc(funcVal, [input]);
  });
  addMockFunctionToObject(realm, reactDomServerValue, requireName, "renderToNodeStream", genericTemporalFunc);
  addMockFunctionToObject(realm, reactDomServerValue, requireName, "renderToStaticNodeStream", genericTemporalFunc);

  reactDomServerValue.refuseSerialization = false;
  reactDomServerValue.makeFinal();
  return reactDomServerValue;
}
