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
import type { BabelNode, BabelNodeJSXIdentifier } from "babel-types";
import {
  Value,
  NumberValue,
  ObjectValue,
  SymbolValue,
  FunctionValue,
  StringValue,
  ArrayValue,
  ECMAScriptSourceFunctionValue,
} from "../values/index.js";
import { Get } from "../methods/index.js";
import { computeBinary } from "../evaluators/BinaryExpression.js";
import { type ReactSerializerState, type AdditionalFunctionEffects } from "../serializer/types.js";
import invariant from "../invariant.js";
import { Properties } from "../singletons.js";
import traverse from "babel-traverse";
import * as t from "babel-types";
import type { BabelNodeStatement } from "babel-types";
import { FatalError } from "../errors.js";

let reactElementSymbolKey = "react.element";

export function isReactElement(val: Value): boolean {
  if (val instanceof ObjectValue && val.properties.has("$$typeof")) {
    let realm = val.$Realm;
    let $$typeof = Get(realm, val, "$$typeof");
    if ($$typeof instanceof SymbolValue) {
      let symbolFromRegistry = realm.globalSymbolRegistry.find(e => e.$Symbol === $$typeof);
      return symbolFromRegistry !== undefined && symbolFromRegistry.$Key === "react.element";
    }
  }
  return false;
}

export function getReactElementSymbol(realm: Realm): SymbolValue {
  let reactElementSymbol = realm.react.reactElementSymbol;
  if (reactElementSymbol !== undefined) {
    return reactElementSymbol;
  }
  let SymbolFor = realm.intrinsics.Symbol.properties.get("for");
  if (SymbolFor !== undefined) {
    let SymbolForDescriptor = SymbolFor.descriptor;

    if (SymbolForDescriptor !== undefined) {
      let SymbolForValue = SymbolForDescriptor.value;
      if (SymbolForValue !== undefined && typeof SymbolForValue.$Call === "function") {
        realm.react.reactElementSymbol = reactElementSymbol = SymbolForValue.$Call(realm.intrinsics.Symbol, [
          new StringValue(realm, reactElementSymbolKey),
        ]);
      }
    }
  }
  invariant(reactElementSymbol instanceof SymbolValue, `ReactElement "$$typeof" property was not a symbol`);
  return reactElementSymbol;
}

export function isTagName(ast: BabelNode): boolean {
  return ast.type === "JSXIdentifier" && /^[a-z]|\-/.test(((ast: any): BabelNodeJSXIdentifier).name);
}

export function isReactComponent(name: string) {
  return name.length > 0 && name[0] === name[0].toUpperCase();
}

export function valueIsClassComponent(realm: Realm, value: Value) {
  if (!(value instanceof FunctionValue)) {
    return false;
  }
  if (value.$Prototype instanceof ObjectValue) {
    let prototype = Get(realm, value.$Prototype, "prototype");
    if (prototype instanceof ObjectValue) {
      return prototype.properties.has("isReactComponent");
    }
  }
  return false;
}

export function addKeyToReactElement(
  realm: Realm,
  reactSerializerState: ReactSerializerState,
  reactElement: ObjectValue
): void {
  // we need to apply a key when we're branched
  let currentKeyValue = Get(realm, reactElement, "key") || realm.intrinsics.null;
  let uniqueKey = getUniqueReactElementKey("", reactSerializerState.usedReactElementKeys);
  let newKeyValue = new StringValue(realm, uniqueKey);
  if (currentKeyValue !== realm.intrinsics.null) {
    newKeyValue = computeBinary(realm, "+", currentKeyValue, newKeyValue);
  }
  // TODO: This might not be safe in DEV because these objects are frozen (Object.freeze).
  // We should probably go behind the scenes in this case to by-pass that.
  reactElement.$Set("key", newKeyValue, reactElement);
}
// we create a unique key for each JSXElement to prevent collisions
// otherwise React will detect a missing/conflicting key at runtime and
// this can break the reconcilation of JSXElements in arrays
export function getUniqueReactElementKey(index?: string, usedReactElementKeys: Set<string>) {
  let key;
  do {
    key = Math.random().toString(36).replace(/[^a-z]+/g, "").substring(0, 2);
  } while (usedReactElementKeys.has(key));
  usedReactElementKeys.add(key);
  if (index !== undefined) {
    return `${key}${index}`;
  }
  return key;
}

// a helper function to map over ArrayValues
export function mapOverArrayValue(realm: Realm, arrayValue: ArrayValue, mapFunc: Function): void {
  let lengthValue = Get(realm, arrayValue, "length");
  invariant(lengthValue instanceof NumberValue, "Invalid length on ArrayValue during reconcilation");
  let length = lengthValue.value;
  for (let i = 0; i < length; i++) {
    let elementProperty = arrayValue.properties.get("" + i);
    let elementPropertyDescriptor = elementProperty && elementProperty.descriptor;
    invariant(elementPropertyDescriptor, `Invalid ArrayValue[${i}] descriptor`);
    let elementValue = elementPropertyDescriptor.value;
    if (elementValue instanceof Value) {
      mapFunc(elementValue, elementPropertyDescriptor);
    }
  }
}

export function convertSimpleClassComponentToFunctionalComponent(
  realm: Realm,
  componentType: ECMAScriptSourceFunctionValue,
  additionalFunctionEffects: AdditionalFunctionEffects
): void {
  let prototype = componentType.properties.get("prototype");
  invariant(prototype);
  invariant(prototype.descriptor);
  prototype.descriptor.configurable = true;
  Properties.DeletePropertyOrThrow(realm, componentType, "prototype");
  // set the prototype back to an object
  componentType.$Prototype = realm.intrinsics.FunctionPrototype;
  // give the function the functional components params
  componentType.$FormalParameters = [t.identifier("props"), t.identifier("context")];
  // add a transform to occur after the additional function has serialized the body of the class
  additionalFunctionEffects.transforms.push((body: Array<BabelNodeStatement>) => {
    // as this was a class before and is now a functional component, we need to replace
    // this.props and this.context to props and context, via the function arugments
    let funcNode = t.functionExpression(null, [], t.blockStatement(body));

    traverse(
      t.file(t.program([t.expressionStatement(funcNode)])),
      {
        "Identifier|ThisExpression"(path) {
          let node = path.node;
          if ((t.isIdentifier(node) && node.name === "this") || t.isThisExpression(node)) {
            let parentPath = path.parentPath;
            let parentNode = parentPath.node;

            if (t.isMemberExpression(parentNode)) {
              // remove the "this" from the member
              parentPath.replaceWith(parentNode.property);
            } else {
              throw new FatalError(
                `conversion of a simple class component to functional component failed due to "this" not being replaced`
              );
            }
          }
        },
      },
      undefined,
      (undefined: any),
      undefined
    );
  });
}
