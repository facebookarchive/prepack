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
  AbstractObjectValue,
  Value,
  NumberValue,
  ObjectValue,
  SymbolValue,
  FunctionValue,
  StringValue,
  ArrayValue,
  ECMAScriptSourceFunctionValue,
} from "../values/index.js";
import type { Descriptor, ReactHint } from "../types";
import { Get } from "../methods/index.js";
import { computeBinary } from "../evaluators/BinaryExpression.js";
import { type ReactSerializerState, type AdditionalFunctionEffects } from "../serializer/types.js";
import invariant from "../invariant.js";
import { Create, Properties } from "../singletons.js";
import traverse from "babel-traverse";
import * as t from "babel-types";
import type { BabelNodeStatement } from "babel-types";
import { FatalError } from "../errors.js";
import { To } from "../singletons.js";
import AbstractValue from "../values/AbstractValue";

export type ReactSymbolTypes = "react.element" | "react.fragment" | "react.portal" | "react.return" | "react.call";

export function isReactElement(val: Value): boolean {
  if (val instanceof ObjectValue && val.properties.has("$$typeof")) {
    let realm = val.$Realm;
    let $$typeof = Get(realm, val, "$$typeof");
    let globalObject = realm.$GlobalObject;
    let globalSymbolValue = Get(realm, globalObject, "Symbol");

    if (globalSymbolValue === realm.intrinsics.undefined) {
      if ($$typeof instanceof NumberValue) {
        return $$typeof.value === 0xeac7;
      }
    } else if ($$typeof instanceof SymbolValue) {
      let symbolFromRegistry = realm.globalSymbolRegistry.find(e => e.$Symbol === $$typeof);
      return symbolFromRegistry !== undefined && symbolFromRegistry.$Key === "react.element";
    }
  }
  return false;
}

export function getReactSymbol(symbolKey: ReactSymbolTypes, realm: Realm): SymbolValue {
  let reactSymbol = realm.react.symbols.get(symbolKey);
  if (reactSymbol !== undefined) {
    return reactSymbol;
  }
  let SymbolFor = realm.intrinsics.Symbol.properties.get("for");
  if (SymbolFor !== undefined) {
    let SymbolForDescriptor = SymbolFor.descriptor;

    if (SymbolForDescriptor !== undefined) {
      let SymbolForValue = SymbolForDescriptor.value;
      if (SymbolForValue !== undefined && typeof SymbolForValue.$Call === "function") {
        reactSymbol = SymbolForValue.$Call(realm.intrinsics.Symbol, [new StringValue(realm, symbolKey)]);
        realm.react.symbols.set(symbolKey, reactSymbol);
      }
    }
  }
  invariant(reactSymbol instanceof SymbolValue, `Symbol("${symbolKey}") could not be found in realm`);
  return reactSymbol;
}

export function isTagName(ast: BabelNode): boolean {
  return ast.type === "JSXIdentifier" && /^[a-z]|\-/.test(((ast: any): BabelNodeJSXIdentifier).name);
}

export function isReactComponent(name: string) {
  return name.length > 0 && name[0] === name[0].toUpperCase();
}

export function valueIsClassComponent(realm: Realm, value: Value): boolean {
  if (!(value instanceof FunctionValue)) {
    return false;
  }
  let prototype = Get(realm, value, "prototype");

  if (prototype instanceof ObjectValue) {
    return To.ToBooleanPartial(realm, Get(realm, prototype, "isReactComponent"));
  }
  return false;
}

export function valueIsKnownReactAbstraction(realm: Realm, value: Value): boolean {
  return value instanceof AbstractObjectValue && realm.react.abstractHints.has(value);
}

// logger isn't typed otherwise it will increase flow cycle length :()
export function valueIsReactLibraryObject(realm: Realm, value: ObjectValue, logger: any): boolean {
  if (realm.fbLibraries.react === value) {
    return true;
  }
  // we check that the object is the React or React-like library by checking for
  // core properties that should exist on it
  let reactVersion = logger.tryQuery(() => Get(realm, value, "version"), undefined);
  if (!(reactVersion instanceof StringValue)) {
    return false;
  }
  let reactCreateElement = logger.tryQuery(() => Get(realm, value, "createElement"), undefined);
  if (!(reactCreateElement instanceof FunctionValue)) {
    return false;
  }
  let reactCloneElement = logger.tryQuery(() => Get(realm, value, "cloneElement"), undefined);
  if (!(reactCloneElement instanceof FunctionValue)) {
    return false;
  }
  let reactIsValidElement = logger.tryQuery(() => Get(realm, value, "isValidElement"), undefined);
  if (!(reactIsValidElement instanceof FunctionValue)) {
    return false;
  }
  let reactComponent = logger.tryQuery(() => Get(realm, value, "Component"), undefined);
  if (!(reactComponent instanceof FunctionValue)) {
    return false;
  }
  let reactChildren = logger.tryQuery(() => Get(realm, value, "Children"), undefined);
  if (!(reactChildren instanceof ObjectValue)) {
    return false;
  }
  return false;
}

export function valueIsLegacyCreateClassComponent(realm: Realm, value: Value): boolean {
  if (!(value instanceof FunctionValue)) {
    return false;
  }
  let prototype = Get(realm, value, "prototype");

  if (prototype instanceof ObjectValue) {
    return prototype.properties.has("__reactAutoBindPairs");
  }
  return false;
}

export function valueIsFactoryClassComponent(realm: Realm, value: Value): boolean {
  if (value instanceof ObjectValue) {
    return To.ToBooleanPartial(realm, Get(realm, value, "render"));
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

// a helper function to loop over ArrayValues
export function forEachArrayValue(realm: Realm, array: ObjectValue, mapFunc: Function): void {
  let lengthValue = Get(realm, array, "length");
  invariant(lengthValue instanceof NumberValue, "Invalid length on ArrayValue during reconcilation");
  let length = lengthValue.value;
  for (let i = 0; i < length; i++) {
    let elementProperty = array.properties.get("" + i);
    let elementPropertyDescriptor = elementProperty && elementProperty.descriptor;
    invariant(elementPropertyDescriptor, `Invalid ArrayValue[${i}] descriptor`);
    let elementValue = elementPropertyDescriptor.value;
    if (elementValue instanceof Value) {
      mapFunc(elementValue, elementPropertyDescriptor);
    }
  }
}

function GetDescriptorForProperty(value: ObjectValue, propertyName: string): ?Descriptor {
  let object = value.properties.get(propertyName);
  invariant(object);
  return object.descriptor;
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

  // fix the length as we've changed the arguments
  let lengthProperty = GetDescriptorForProperty(componentType, "length");
  invariant(lengthProperty);
  lengthProperty.writable = false;
  lengthProperty.enumerable = false;
  lengthProperty.configurable = true;
  // ensure the length value is set to the new value
  let lengthValue = Get(realm, componentType, "length");
  invariant(lengthValue instanceof NumberValue);
  lengthValue.value = 2;

  // change the function kind
  componentType.$FunctionKind = "normal";
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

export function normalizeFunctionalComponentParamaters(func: ECMAScriptSourceFunctionValue): void {
  func.$FormalParameters = func.$FormalParameters.map((param, i) => {
    if (i === 0) {
      return t.isIdentifier(param) ? param : t.identifier("props");
    } else {
      return t.isIdentifier(param) ? param : t.identifier("context");
    }
  });
}

export function createReactHintObject(object: ObjectValue, propertyName: string, args: Array<Value>): ReactHint {
  return {
    object,
    propertyName,
    args,
  };
}

export function getComponentTypeFromRootValue(realm: Realm, value: Value): ECMAScriptSourceFunctionValue {
  let _valueIsKnownReactAbstraction = valueIsKnownReactAbstraction(realm, value);
  invariant(
    value instanceof ECMAScriptSourceFunctionValue || _valueIsKnownReactAbstraction,
    "only ECMAScriptSourceFunctionValue function values or known React abstract values are supported as React root components"
  );
  if (_valueIsKnownReactAbstraction) {
    invariant(value instanceof AbstractValue);
    let reactHint = realm.react.abstractHints.get(value);

    invariant(reactHint);
    if (typeof reactHint !== "string" && reactHint.object === realm.fbLibraries.reactRelay) {
      switch (reactHint.propertyName) {
        case "createFragmentContainer":
        case "createPaginationContainer":
        case "createRefetchContainer":
          invariant(Array.isArray(reactHint.args));
          // componentType is the 1st argument of a ReactRelay container
          let componentType = reactHint.args[0];
          invariant(componentType instanceof ECMAScriptSourceFunctionValue);
          return componentType;
        default:
          invariant(
            false,
            `unsupported known React abstraction - ReactRelay property "${reactHint.propertyName}" not supported`
          );
      }
    }
    invariant(false, "unsupported known React abstraction");
  } else {
    invariant(value instanceof ECMAScriptSourceFunctionValue);
    return value;
  }
}

// props should never have "ref" or "key" properties, as they're part of ReactElement
// object instead. to ensure that we can give this hint, we create them and then
// delete them, so their descriptor is left undefined. we use this knowledge later
// to ensure that when dealing with creating ReactElements with partial config,
// we don't have to bail out becuase "config" may or may not have "key" or/and "ref"
export function deleteRefAndKeyFromProps(realm: Realm, props: ObjectValue | AbstractObjectValue): void {
  let objectValue;
  if (props instanceof AbstractObjectValue) {
    let elements = props.values.getElements();
    if (elements && elements.size > 0) {
      objectValue = Array.from(elements)[0];
    }
    // we don't want to serialize in the output that we're making these deletes
    invariant(objectValue instanceof ObjectValue);
    objectValue.refuseSerialization = true;
  }
  Properties.Set(realm, props, "ref", realm.intrinsics.undefined, true);
  props.$Delete("ref");
  Properties.Set(realm, props, "key", realm.intrinsics.undefined, true);
  props.$Delete("key");
  if (props instanceof AbstractObjectValue) {
    invariant(objectValue instanceof ObjectValue);
    objectValue.refuseSerialization = false;
  }
}

export function objectHasNoPartialKeyAndRef(
  realm: Realm,
  object: ObjectValue | AbstractValue | AbstractObjectValue
): boolean {
  if (object instanceof AbstractValue) {
    return true;
  }
  return !(Get(realm, object, "key") instanceof AbstractValue || Get(realm, object, "ref") instanceof AbstractValue);
}

function recursivelyFlattenArray(realm: Realm, array, targetArray): void {
  forEachArrayValue(realm, array, item => {
    if (item instanceof ArrayValue) {
      recursivelyFlattenArray(realm, item, targetArray);
    } else {
      let lengthValue = Get(realm, targetArray, "length");
      invariant(lengthValue instanceof NumberValue);
      Properties.Set(realm, targetArray, "" + lengthValue.value, item, true);
    }
  });
}

export function flattenChildren(realm: Realm, array: ArrayValue): ArrayValue {
  let flattenedChildren = Create.ArrayCreate(realm, 0);
  recursivelyFlattenArray(realm, array, flattenedChildren);
  return flattenedChildren;
}
