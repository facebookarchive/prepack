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
import { AbruptCompletion, SimpleNormalCompletion } from "../completions.js";
import type { BabelNode, BabelNodeJSXIdentifier } from "@babel/types";
import { parseExpression } from "@babel/parser";
import {
  AbstractObjectValue,
  AbstractValue,
  ArrayValue,
  BooleanValue,
  BoundFunctionValue,
  ECMAScriptFunctionValue,
  ECMAScriptSourceFunctionValue,
  EmptyValue,
  FunctionValue,
  NumberValue,
  ObjectValue,
  StringValue,
  SymbolValue,
  UndefinedValue,
  Value,
} from "../values/index.js";
import { TemporalObjectAssignEntry } from "../utils/generator.js";
import type { Descriptor, ReactComponentTreeConfig, ReactHint, PropertyBinding } from "../types.js";
import { Get, IsDataDescriptor } from "../methods/index.js";
import { computeBinary } from "../evaluators/BinaryExpression.js";
import type { AdditionalFunctionTransform, ReactEvaluatedNode } from "../serializer/types.js";
import invariant from "../invariant.js";
import { Create, Properties, To } from "../singletons.js";
import traverse from "@babel/traverse";
import * as t from "@babel/types";
import type { BabelNodeStatement } from "@babel/types";
import { CompilerDiagnostic, FatalError } from "../errors.js";
import { cloneDescriptor, PropertyDescriptor } from "../descriptors.js";

export type ReactSymbolTypes =
  | "react.element"
  | "react.context"
  | "react.provider"
  | "react.fragment"
  | "react.portal"
  | "react.return"
  | "react.call"
  | "react.forward_ref";

export function isReactElement(val: Value): boolean {
  if (!(val instanceof ObjectValue)) {
    return false;
  }
  let realm = val.$Realm;
  if (!realm.react.enabled) {
    return false;
  }
  if (realm.react.reactElements.has(val)) {
    return true;
  }
  if (!val.properties.has("type") || !val.properties.has("props") || !val.properties.has("$$typeof")) {
    return false;
  }
  let $$typeof = getProperty(realm, val, "$$typeof");
  let globalObject = realm.$GlobalObject;
  let globalSymbolValue = getProperty(realm, globalObject, "Symbol");

  if (globalSymbolValue === realm.intrinsics.undefined) {
    if ($$typeof instanceof NumberValue) {
      return $$typeof.value === 0xeac7;
    }
  } else if ($$typeof instanceof SymbolValue) {
    let symbolFromRegistry = realm.globalSymbolRegistry.find(e => e.$Symbol === $$typeof);
    let _isReactElement = symbolFromRegistry !== undefined && symbolFromRegistry.$Key === "react.element";
    if (_isReactElement) {
      // If we get there, it means the ReactElement was created in manual user-space
      realm.react.reactElements.set(val, { createdDuringReconcilation: false, firstRenderOnly: false });
      return true;
    }
  }
  return false;
}

export function isReactPropsObject(val: Value): boolean {
  if (!(val instanceof ObjectValue)) {
    return false;
  }
  let realm = val.$Realm;
  if (!realm.react.enabled) {
    return false;
  }
  if (realm.react.reactProps.has(val)) {
    return true;
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
      invariant(SymbolForDescriptor instanceof PropertyDescriptor);
      let SymbolForValue = SymbolForDescriptor.value;
      if (SymbolForValue instanceof ObjectValue && typeof SymbolForValue.$Call === "function") {
        reactSymbol = SymbolForValue.$Call(realm.intrinsics.Symbol, [new StringValue(realm, symbolKey)]);
        invariant(reactSymbol instanceof SymbolValue);
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

export function isReactComponent(name: string): boolean {
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
  if (value instanceof ObjectValue && !ArrayValue.isIntrinsicAndHasWidenedNumericProperty(value)) {
    return To.ToBooleanPartial(realm, Get(realm, value, "render"));
  }
  return false;
}

export function addKeyToReactElement(realm: Realm, reactElement: ObjectValue): ObjectValue {
  let typeValue = getProperty(realm, reactElement, "type");
  let refValue = getProperty(realm, reactElement, "ref");
  let propsValue = getProperty(realm, reactElement, "props");
  // we need to apply a key when we're branched
  let currentKeyValue = getProperty(realm, reactElement, "key") || realm.intrinsics.null;
  let uniqueKey = getUniqueReactElementKey("", realm.react.usedReactElementKeys);
  let newKeyValue = new StringValue(realm, uniqueKey);
  if (currentKeyValue !== realm.intrinsics.null) {
    newKeyValue = computeBinary(realm, "+", currentKeyValue, newKeyValue);
  }
  invariant(propsValue instanceof ObjectValue);
  return createInternalReactElement(realm, typeValue, newKeyValue, refValue, propsValue);
}
// we create a unique key for each JSXElement to prevent collisions
// otherwise React will detect a missing/conflicting key at runtime and
// this can break the reconcilation of JSXElements in arrays
export function getUniqueReactElementKey(index?: string, usedReactElementKeys: Set<string>): string {
  let key;
  do {
    key = Math.random()
      .toString(36)
      .replace(/[^a-z]+/g, "")
      .substring(0, 2);
  } while (usedReactElementKeys.has(key));
  usedReactElementKeys.add(key);
  if (index !== undefined) {
    return `${key}${index}`;
  }
  return key;
}

// a helper function to loop over ArrayValues
export function forEachArrayValue(
  realm: Realm,
  array: ArrayValue,
  mapFunc: (element: Value, index: number) => void
): void {
  let lengthValue = Get(realm, array, "length");
  let isConditionalLength = lengthValue instanceof AbstractValue && lengthValue.kind === "conditional";
  let length;
  if (isConditionalLength) {
    length = getMaxLength(lengthValue, 0);
  } else {
    invariant(lengthValue instanceof NumberValue, "TODO: support other types of array length value");
    length = lengthValue.value;
  }
  for (let i = 0; i < length; i++) {
    let elementProperty = array.properties.get("" + i);
    let elementPropertyDescriptor = elementProperty && elementProperty.descriptor;
    if (elementPropertyDescriptor) {
      invariant(elementPropertyDescriptor instanceof PropertyDescriptor);
      let elementValue = elementPropertyDescriptor.value;
      // If we are in an array with conditional length, the element might be a conditional join
      // of the same type as the length of the array
      if (isConditionalLength && elementValue instanceof AbstractValue && elementValue.kind === "conditional") {
        invariant(lengthValue instanceof AbstractValue);
        let lengthCondition = lengthValue.args[0];
        let elementCondition = elementValue.args[0];
        // If they are the same condition
        invariant(lengthCondition.equals(elementCondition), "TODO: support cases where the condition is not the same");
      }
      invariant(elementValue instanceof Value);
      mapFunc(elementValue, i);
    }
  }
}

export function mapArrayValue(
  realm: Realm,
  array: ArrayValue,
  mapFunc: (element: Value, descriptor: Descriptor) => Value
): ArrayValue {
  let returnTheNewArray = false;
  let newArray;

  const mapArray = (lengthValue: NumberValue): void => {
    let length = lengthValue.value;

    for (let i = 0; i < length; i++) {
      let elementProperty = array.properties.get("" + i);
      let elementPropertyDescriptor = elementProperty && elementProperty.descriptor;
      if (elementPropertyDescriptor) {
        invariant(elementPropertyDescriptor instanceof PropertyDescriptor);
        let elementValue = elementPropertyDescriptor.value;
        if (elementValue instanceof Value) {
          let newElement = mapFunc(elementValue, elementPropertyDescriptor);
          if (newElement !== elementValue) {
            returnTheNewArray = true;
          }
          Create.CreateDataPropertyOrThrow(realm, newArray, "" + i, newElement);
          continue;
        }
      }
      Create.CreateDataPropertyOrThrow(realm, newArray, "" + i, realm.intrinsics.undefined);
    }
  };

  let lengthValue = Get(realm, array, "length");
  if (lengthValue instanceof AbstractValue && lengthValue.kind === "conditional") {
    returnTheNewArray = true;
    let [condValue, consequentVal, alternateVal] = lengthValue.args;
    newArray = Create.ArrayCreate(realm, 0);
    realm.evaluateWithAbstractConditional(
      condValue,
      () => {
        return realm.evaluateForEffects(
          () => {
            invariant(consequentVal instanceof NumberValue);
            mapArray(consequentVal);
            return realm.intrinsics.undefined;
          },
          null,
          "mapArrayValue consequent"
        );
      },
      () => {
        return realm.evaluateForEffects(
          () => {
            invariant(alternateVal instanceof NumberValue);
            mapArray(alternateVal);
            return realm.intrinsics.undefined;
          },
          null,
          "mapArrayValue alternate"
        );
      }
    );
  } else if (lengthValue instanceof NumberValue) {
    newArray = Create.ArrayCreate(realm, lengthValue.value);
    mapArray(lengthValue);
  } else {
    invariant(false, "TODO: support other types of array length value");
  }
  return returnTheNewArray ? newArray : array;
}

function GetDescriptorForProperty(value: ObjectValue, propertyName: string): ?Descriptor {
  let object = value.properties.get(propertyName);
  invariant(object);
  return object.descriptor;
}

export function convertSimpleClassComponentToFunctionalComponent(
  realm: Realm,
  complexComponentType: ECMAScriptSourceFunctionValue,
  transforms: Array<AdditionalFunctionTransform>
): void {
  let prototype = complexComponentType.properties.get("prototype");
  invariant(prototype);
  invariant(prototype.descriptor instanceof PropertyDescriptor);
  prototype.descriptor.configurable = true;
  Properties.DeletePropertyOrThrow(realm, complexComponentType, "prototype");

  // change the function kind
  complexComponentType.$FunctionKind = "normal";
  // set the prototype back to an object
  complexComponentType.$Prototype = realm.intrinsics.FunctionPrototype;
  // give the function the functional components params
  complexComponentType.$FormalParameters = [t.identifier("props"), t.identifier("context")];
  // add a transform to occur after the additional function has serialized the body of the class
  transforms.push((body: Array<BabelNodeStatement>) => {
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
      {},
      undefined
    );
    traverse.cache.clear();
  });
}

function createBinding(descriptor: void | Descriptor, key: string | SymbolValue, object: ObjectValue) {
  return {
    descriptor,
    key,
    object,
  };
}

function cloneProperties(realm: Realm, properties: Map<string, any>, object: ObjectValue): Map<string, any> {
  let newProperties = new Map();
  for (let [propertyName, { descriptor }] of properties) {
    newProperties.set(
      propertyName,
      createBinding(cloneDescriptor(descriptor.throwIfNotConcrete(realm)), propertyName, object)
    );
  }
  return newProperties;
}

function cloneSymbols(realm: Realm, symbols: Map<SymbolValue, any>, object: ObjectValue): Map<SymbolValue, any> {
  let newSymbols = new Map();
  for (let [symbol, { descriptor }] of symbols) {
    newSymbols.set(symbol, createBinding(cloneDescriptor(descriptor.throwIfNotConcrete(realm)), symbol, object));
  }
  return newSymbols;
}

function cloneValue(
  realm: Realm,
  originalValue: Value,
  _prototype: null | ObjectValue,
  copyToObject?: ObjectValue
): Value {
  if (originalValue instanceof FunctionValue) {
    return cloneFunction(realm, originalValue, _prototype, copyToObject);
  }
  invariant(false, "TODO: add support to cloneValue() for more value types");
}

function cloneFunction(
  realm: Realm,
  originalValue: Value,
  _prototype: null | ObjectValue,
  copyToObject?: ObjectValue
): FunctionValue {
  let newValue;
  if (originalValue instanceof ECMAScriptSourceFunctionValue) {
    newValue = copyToObject || new ECMAScriptSourceFunctionValue(realm, originalValue.intrinsicName);
    invariant(newValue instanceof ECMAScriptSourceFunctionValue);
    // $FlowFixMe: complains about Object.assign
    Object.assign(newValue, originalValue);
    let properties = cloneProperties(realm, originalValue.properties, newValue);
    newValue.properties = properties;
    let symbols = cloneSymbols(realm, originalValue.symbols, newValue);
    newValue.symbols = symbols;

    // handle home object + prototype
    let originalPrototype = originalValue.$HomeObject;
    invariant(originalPrototype instanceof ObjectValue);
    let prototype = _prototype || clonePrototype(realm, originalPrototype);
    newValue.$HomeObject = prototype;
    if (originalPrototype.properties.has("constructor")) {
      Properties.Set(realm, prototype, "constructor", newValue, false);
    }
    if (originalValue.properties.has("prototype")) {
      Properties.Set(realm, newValue, "prototype", prototype, false);
    }
  }
  invariant(newValue instanceof FunctionValue, "TODO: add support to cloneValue() for more function types");
  return newValue;
}

function clonePrototype(realm: Realm, prototype: Value): ObjectValue {
  invariant(prototype instanceof ObjectValue);
  let newPrototype = new ObjectValue(realm, realm.intrinsics.ObjectPrototype, prototype.intrinsicName);

  Object.assign(newPrototype, prototype);
  for (let [propertyName] of prototype.properties) {
    if (propertyName !== "constructor") {
      let originalValue = Get(realm, prototype, propertyName);
      let newValue = cloneValue(realm, originalValue, prototype);
      Properties.Set(realm, newPrototype, propertyName, newValue, false);
    }
  }
  for (let [symbol] of prototype.symbols) {
    let originalValue = Get(realm, prototype, symbol);
    let newValue = cloneValue(realm, originalValue, prototype);
    Properties.Set(realm, newPrototype, symbol, newValue, false);
  }
  return newPrototype;
}

const skipFunctionProperties = new Set(["length", "prototype", "arguments", "name", "caller"]);

export function convertFunctionalComponentToComplexClassComponent(
  realm: Realm,
  functionalComponentType: ECMAScriptSourceFunctionValue | BoundFunctionValue,
  complexComponentType: void | ECMAScriptSourceFunctionValue | BoundFunctionValue,
  transforms: Array<AdditionalFunctionTransform>
): void {
  invariant(
    complexComponentType instanceof ECMAScriptSourceFunctionValue || complexComponentType instanceof BoundFunctionValue
  );
  // get all properties on the functional component that were added in user-code
  // we add defaultProps as undefined, as merging a class component's defaultProps on to
  // a differnet component isn't right, we can discard defaultProps instead via folding
  // we also don't want propTypes from the class component, so we remove that too
  let userCodePropertiesToAdd: Map<string, PropertyBinding> = new Map([
    ["defaultProps", createBinding(undefined, "defaultProps", functionalComponentType)],
    ["propTypes", createBinding(undefined, "propTypes", functionalComponentType)],
  ]);
  let userCodeSymbolsToAdd: Map<SymbolValue, PropertyBinding> = new Map();

  for (let [propertyName, binding] of functionalComponentType.properties) {
    if (!skipFunctionProperties.has(propertyName)) {
      userCodePropertiesToAdd.set(propertyName, binding);
    }
  }
  for (let [symbol, binding] of functionalComponentType.symbols) {
    userCodeSymbolsToAdd.set(symbol, binding);
  }

  cloneValue(realm, complexComponentType, null, functionalComponentType);
  // then copy back and properties that were on the original functional component
  // ensuring we overwrite any existing ones
  for (let [propertyName, binding] of userCodePropertiesToAdd) {
    functionalComponentType.properties.set(propertyName, binding);
  }
  for (let [symbol, binding] of userCodeSymbolsToAdd) {
    functionalComponentType.symbols.set(symbol, binding);
  }
  // add a transform to occur after the additional function has serialized the body of the class
  transforms.push((body: Array<BabelNodeStatement>) => {
    // as we've converted a functional component to a complex one, we are going to have issues with
    // "props" and "context" references, as they're now going to be "this.props" and "this.context".
    // we simply need a to add to vars to beginning of the body to get around this
    // if they're not used, any DCE tool post-Prepack (GCC or Uglify) will remove them
    body.unshift(
      t.variableDeclaration("var", [
        t.variableDeclarator(t.identifier("props"), t.memberExpression(t.thisExpression(), t.identifier("props"))),
        t.variableDeclarator(t.identifier("context"), t.memberExpression(t.thisExpression(), t.identifier("context"))),
      ])
    );
  });
}

export function normalizeFunctionalComponentParamaters(func: ECMAScriptSourceFunctionValue): void {
  // fix the length as we may change the arguments
  let lengthProperty = GetDescriptorForProperty(func, "length");
  invariant(lengthProperty instanceof PropertyDescriptor);
  lengthProperty.writable = false;
  lengthProperty.enumerable = false;
  lengthProperty.configurable = true;
  func.$FormalParameters = func.$FormalParameters.map((param, i) => {
    if (i === 0) {
      return t.isIdentifier(param) ? param : t.identifier("props");
    } else {
      return t.isIdentifier(param) ? param : t.identifier("context");
    }
  });
  if (func.$FormalParameters.length === 1) {
    func.$FormalParameters.push(t.identifier("context"));
  }
  // ensure the length value is set to the correct value after
  // we've made mutations to the arguments of this function
  let lengthValue = lengthProperty.value;
  invariant(lengthValue instanceof NumberValue);
  lengthValue.value = func.$FormalParameters.length;
}

export function createReactHintObject(
  object: ObjectValue,
  propertyName: string,
  args: Array<Value>,
  firstRenderValue: Value
): ReactHint {
  return {
    firstRenderValue,
    object,
    propertyName,
    args,
  };
}

export function getComponentTypeFromRootValue(
  realm: Realm,
  value: Value
): ECMAScriptSourceFunctionValue | BoundFunctionValue | null {
  let _valueIsKnownReactAbstraction = valueIsKnownReactAbstraction(realm, value);
  if (
    !(
      value instanceof ECMAScriptSourceFunctionValue ||
      value instanceof BoundFunctionValue ||
      _valueIsKnownReactAbstraction
    )
  ) {
    return null;
  }
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
          invariant(
            componentType instanceof ECMAScriptSourceFunctionValue || componentType instanceof BoundFunctionValue
          );
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
    invariant(value instanceof ECMAScriptSourceFunctionValue || value instanceof BoundFunctionValue);
    return value;
  }
}

export function flagPropsWithNoPartialKeyOrRef(realm: Realm, props: ObjectValue | AbstractObjectValue): void {
  realm.react.propsWithNoPartialKeyOrRef.add(props);
}

export function hasNoPartialKeyOrRef(realm: Realm, props: ObjectValue | AbstractObjectValue): boolean {
  if (realm.react.propsWithNoPartialKeyOrRef.has(props)) {
    return true;
  }
  if (props instanceof ObjectValue && !props.isPartialObject()) {
    return true;
  }
  if (props instanceof AbstractObjectValue) {
    if (props.values.isTop()) {
      return false;
    }
    let elements = props.values.getElements();
    for (let element of elements) {
      invariant(element instanceof ObjectValue);
      let wasSafe = hasNoPartialKeyOrRef(realm, element);
      if (!wasSafe) {
        return false;
      }
    }
    return true;
  }
  if (props instanceof ObjectValue && props.properties.has("key") && props.properties.has("ref")) {
    return true;
  }
  return false;
}

export function getMaxLength(value: Value, maxLength: number): number {
  if (value instanceof NumberValue) {
    if (value.value > maxLength) {
      return value.value;
    } else {
      return maxLength;
    }
  } else if (value instanceof AbstractValue && value.kind === "conditional") {
    let [, consequentVal, alternateVal] = value.args;
    let consequentMaxVal = getMaxLength(consequentVal, maxLength);
    let alternateMaxVal = getMaxLength(alternateVal, maxLength);
    if (consequentMaxVal > maxLength && consequentMaxVal >= alternateMaxVal) {
      return consequentMaxVal;
    } else if (alternateMaxVal > maxLength && alternateMaxVal >= consequentMaxVal) {
      return alternateMaxVal;
    }
    return maxLength;
  }
  invariant(false, "TODO: support other types of array length value");
}

function recursivelyFlattenArray(realm: Realm, array, targetArray: ArrayValue, noHoles: boolean): void {
  forEachArrayValue(realm, array, _item => {
    let element = _item;
    if (element instanceof ArrayValue && !element.intrinsicName) {
      recursivelyFlattenArray(realm, element, targetArray, noHoles);
    } else {
      let lengthValue = Get(realm, targetArray, "length");
      invariant(lengthValue instanceof NumberValue);
      if (noHoles && element instanceof EmptyValue) {
        // We skip holely elements
        return;
      } else if (noHoles && element instanceof AbstractValue && element.kind === "conditional") {
        let [condValue, consequentVal, alternateVal] = element.args;
        invariant(condValue instanceof AbstractValue);
        let consquentIsHolely = consequentVal instanceof EmptyValue;
        let alternateIsHolely = alternateVal instanceof EmptyValue;

        if (consquentIsHolely && alternateIsHolely) {
          // We skip holely elements
          return;
        }
        if (consquentIsHolely) {
          element = AbstractValue.createFromLogicalOp(
            realm,
            "&&",
            AbstractValue.createFromUnaryOp(realm, "!", condValue),
            alternateVal
          );
        }
        if (alternateIsHolely) {
          element = AbstractValue.createFromLogicalOp(realm, "&&", condValue, consequentVal);
        }
      }
      Properties.Set(realm, targetArray, "" + lengthValue.value, element, true);
    }
  });
}

export function flattenChildren(realm: Realm, array: ArrayValue, noHoles: boolean): ArrayValue {
  let flattenedChildren = Create.ArrayCreate(realm, 0);
  recursivelyFlattenArray(realm, array, flattenedChildren, noHoles);
  flattenedChildren.makeFinal();
  return flattenedChildren;
}

// This function is mainly use to get internal properties
// on objects that we know are safe to access internally
// such as ReactElements. Getting properties here does
// not emit change to modified bindings and is intended
// for only internal usage – not for user-land code
export function getProperty(
  realm: Realm,
  object: ObjectValue | AbstractObjectValue,
  property: string | SymbolValue
): Value {
  if (object instanceof AbstractObjectValue) {
    if (object.values.isTop()) {
      return realm.intrinsics.undefined;
    }
    let elements = object.values.getElements();
    invariant(elements.size === 1, "TODO: deal with multiple elements");
    for (let element of elements) {
      invariant(element instanceof ObjectValue, "TODO: deal with object set templates");
      object = element;
    }
    invariant(object instanceof ObjectValue);
  }
  let binding;
  if (typeof property === "string") {
    binding = object.properties.get(property);
  } else {
    binding = object.symbols.get(property);
  }
  if (!binding) {
    return realm.intrinsics.undefined;
  }
  let descriptor = binding.descriptor;

  if (!descriptor) {
    return realm.intrinsics.undefined;
  }
  invariant(descriptor instanceof PropertyDescriptor);
  let value = descriptor.value;
  if (value === undefined) {
    AbstractValue.reportIntrospectionError(object, `react/utils/getProperty unsupported getter/setter property`);
    throw new FatalError();
  }
  invariant(value instanceof Value, `react/utils/getProperty should not be called on internal properties`);
  return value;
}

export function createReactEvaluatedNode(
  status:
    | "ROOT"
    | "NEW_TREE"
    | "INLINED"
    | "BAIL-OUT"
    | "FATAL"
    | "UNKNOWN_TYPE"
    | "RENDER_PROPS"
    | "FORWARD_REF"
    | "NORMAL",
  name: string
): ReactEvaluatedNode {
  return {
    children: [],
    message: "",
    name,
    status,
  };
}

export function getComponentName(realm: Realm, componentType: Value): string {
  if (componentType instanceof SymbolValue && componentType === getReactSymbol("react.fragment", realm)) {
    return "React.Fragment";
  } else if (componentType instanceof SymbolValue) {
    return "unknown symbol";
  }
  // $FlowFixMe: this code is fine, Flow thinks that coponentType is bound to string...
  if (isReactComponent(componentType)) {
    return "ReactElement";
  }
  if (componentType === realm.intrinsics.undefined || componentType === realm.intrinsics.null) {
    return "no name";
  }
  invariant(
    componentType instanceof ECMAScriptSourceFunctionValue ||
      componentType instanceof BoundFunctionValue ||
      componentType instanceof AbstractObjectValue ||
      componentType instanceof AbstractValue ||
      componentType instanceof ObjectValue
  );
  let boundText = componentType instanceof BoundFunctionValue ? "bound " : "";

  if (componentType.__originalName) {
    return boundText + componentType.__originalName;
  }
  if (realm.fbLibraries.reactRelay !== undefined) {
    if (componentType === Get(realm, realm.fbLibraries.reactRelay, "QueryRenderer")) {
      return boundText + "QueryRenderer";
    }
  }
  if (componentType instanceof ECMAScriptSourceFunctionValue && componentType.$Prototype !== undefined) {
    let name = Get(realm, componentType, "name");

    if (name instanceof StringValue) {
      return boundText + name.value;
    }
  }
  if (componentType instanceof ObjectValue) {
    let $$typeof = getProperty(realm, componentType, "$$typeof");

    if ($$typeof === getReactSymbol("react.forward_ref", realm)) {
      return "forwarded ref";
    }
  }
  if (componentType instanceof FunctionValue) {
    return boundText + "anonymous";
  }
  return "unknown";
}

export function convertConfigObjectToReactComponentTreeConfig(
  realm: Realm,
  config: ObjectValue | UndefinedValue
): ReactComponentTreeConfig {
  // defaults
  let firstRenderOnly = false;
  let isRoot = false;
  let modelString;

  if (!(config instanceof UndefinedValue)) {
    for (let [key] of config.properties) {
      let propValue = getProperty(realm, config, key);
      if (propValue instanceof StringValue || propValue instanceof NumberValue || propValue instanceof BooleanValue) {
        let value = propValue.value;

        if (typeof value === "boolean") {
          // boolean options
          if (key === "firstRenderOnly") {
            firstRenderOnly = value;
          } else if (key === "isRoot") {
            isRoot = value;
          }
        } else if (typeof value === "string") {
          try {
            // result here is ignored as the main point here is to
            // check and produce error
            JSON.parse(value);
          } catch (e) {
            let componentModelError = new CompilerDiagnostic(
              "Failed to parse model for component",
              realm.currentLocation,
              "PP1008",
              "FatalError"
            );
            if (realm.handleError(componentModelError) !== "Recover") {
              throw new FatalError();
            }
          }
          // string options
          if (key === "model") {
            modelString = value;
          }
        }
      } else {
        let diagnostic = new CompilerDiagnostic(
          "__optimizeReactComponentTree(rootComponent, config) has been called with invalid arguments",
          realm.currentLocation,
          "PP0024",
          "FatalError"
        );
        realm.handleError(diagnostic);
        if (realm.handleError(diagnostic) === "Fail") throw new FatalError();
      }
    }
  }
  return {
    firstRenderOnly,
    isRoot,
    modelString,
  };
}

export function getValueFromFunctionCall(
  realm: Realm,
  func: ECMAScriptSourceFunctionValue | BoundFunctionValue,
  funcThis: ObjectValue | AbstractObjectValue | UndefinedValue,
  args: Array<Value>,
  isConstructor?: boolean = false
): Value {
  invariant(func.$Call, "Expected function to be a FunctionValue with $Call method");
  let funcCall = func.$Call;
  let newCall = func.$Construct;
  let completion;
  try {
    let value;
    if (isConstructor) {
      invariant(newCall);
      value = newCall(args, func);
    } else {
      value = funcCall(funcThis, args);
    }
    completion = new SimpleNormalCompletion(value);
  } catch (error) {
    if (error instanceof AbruptCompletion) {
      completion = error;
    } else {
      throw error;
    }
  }
  return realm.returnOrThrowCompletion(completion);
}

function isEventProp(name: string): boolean {
  return name.length > 2 && name[0].toLowerCase() === "o" && name[1].toLowerCase() === "n";
}

export function createNoopFunction(realm: Realm): ECMAScriptSourceFunctionValue {
  if (realm.react.noopFunction !== undefined) {
    return realm.react.noopFunction;
  }
  let noOpFunc = new ECMAScriptSourceFunctionValue(realm);
  noOpFunc.initialize([], t.blockStatement([]));
  realm.react.noopFunction = noOpFunc;
  return noOpFunc;
}

export function doNotOptimizeComponent(realm: Realm, componentType: Value): boolean {
  if (componentType instanceof ObjectValue) {
    let doNotOptimize = Get(realm, componentType, "__reactCompilerDoNotOptimize");

    if (doNotOptimize instanceof BooleanValue) {
      return doNotOptimize.value;
    }
  }
  return false;
}

export function createDefaultPropsHelper(realm: Realm): ECMAScriptSourceFunctionValue {
  let defaultPropsHelper = `
    function defaultPropsHelper(props, defaultProps) {
      for (var propName in defaultProps) {
        if (props[propName] === undefined) {
          props[propName] = defaultProps[propName];
        }
      }
      return props;
    }
  `;

  let escapeHelperAst = parseExpression(defaultPropsHelper, { plugins: ["flow"] });
  let helper = new ECMAScriptSourceFunctionValue(realm);
  helper.initialize(escapeHelperAst.params, escapeHelperAst.body);
  return helper;
}

export function createInternalReactElement(
  realm: Realm,
  type: Value,
  key: Value,
  ref: Value,
  props: ObjectValue
): ObjectValue {
  let obj = Create.ObjectCreate(realm, realm.intrinsics.ObjectPrototype);

  // Sanity check the type is not conditional
  if (type instanceof AbstractValue && type.kind === "conditional") {
    invariant(false, "createInternalReactElement should never encounter a conditional type");
  }

  Create.CreateDataPropertyOrThrow(realm, obj, "$$typeof", getReactSymbol("react.element", realm));
  Create.CreateDataPropertyOrThrow(realm, obj, "type", type);
  Create.CreateDataPropertyOrThrow(realm, obj, "key", key);
  Create.CreateDataPropertyOrThrow(realm, obj, "ref", ref);
  Create.CreateDataPropertyOrThrow(realm, obj, "props", props);
  Create.CreateDataPropertyOrThrow(realm, obj, "_owner", realm.intrinsics.null);
  obj.makeFinal();
  // If we're in "rendering" a React component tree, we should have an active reconciler
  let activeReconciler = realm.react.activeReconciler;
  let createdDuringReconcilation = activeReconciler !== undefined;
  let firstRenderOnly = createdDuringReconcilation ? activeReconciler.componentTreeConfig.firstRenderOnly : false;

  realm.react.reactElements.set(obj, { createdDuringReconcilation, firstRenderOnly });
  // Sanity check to ensure no bugs have crept in
  invariant(
    realm.react.reactProps.has(props) && props.mightBeFinalObject(),
    "React props object is not correctly setup"
  );
  return obj;
}

function applyClonedTemporalAlias(realm: Realm, props: ObjectValue, clonedProps: ObjectValue): void {
  let temporalAlias = props.temporalAlias;
  invariant(temporalAlias !== undefined);
  if (temporalAlias.kind === "conditional") {
    // Leave in for now, we should deal with this later, but there might
    // be a better option.
    invariant(false, "TODO applyClonedTemporalAlias conditional");
  }
  let temporalOperationEntry = realm.getTemporalOperationEntryFromDerivedValue(temporalAlias);
  if (!(temporalOperationEntry instanceof TemporalObjectAssignEntry)) {
    invariant(false, "TODO nont TemporalObjectAssignEntry");
  }
  invariant(temporalOperationEntry !== undefined);
  let temporalArgs = temporalOperationEntry.args;
  // replace the original props with the cloned one
  let [to, ...sources] = temporalArgs.map(arg => (arg === props ? clonedProps : arg));

  invariant(to instanceof ObjectValue || to instanceof AbstractObjectValue);
  AbstractValue.createTemporalObjectAssign(realm, to, sources);
}

export function cloneProps(realm: Realm, props: ObjectValue, newChildren?: Value): ObjectValue {
  let clonedProps = new ObjectValue(realm, realm.intrinsics.ObjectPrototype);

  for (let [propName, binding] of props.properties) {
    if (binding && binding.descriptor) {
      invariant(binding.descriptor instanceof PropertyDescriptor);
      if (binding.descriptor.enumerable) {
        if (newChildren !== undefined && propName === "children") {
          Properties.Set(realm, clonedProps, propName, newChildren, true);
        } else {
          Properties.Set(realm, clonedProps, propName, getProperty(realm, props, propName), true);
        }
      }
    }
  }

  if (props.isPartialObject()) {
    clonedProps.makePartial();
  }
  if (props.isSimpleObject()) {
    clonedProps.makeSimple();
  }
  if (realm.react.propsWithNoPartialKeyOrRef.has(props)) {
    flagPropsWithNoPartialKeyOrRef(realm, clonedProps);
  }
  if (props.temporalAlias !== undefined) {
    applyClonedTemporalAlias(realm, props, clonedProps);
  }
  clonedProps.makeFinal();
  realm.react.reactProps.add(clonedProps);
  return clonedProps;
}

export function applyObjectAssignConfigsForReactElement(realm: Realm, to: ObjectValue, sources: Array<Value>): void {
  // Get the global Object.assign
  let globalObj = Get(realm, realm.$GlobalObject, "Object");
  invariant(globalObj instanceof ObjectValue);
  let objAssign = Get(realm, globalObj, "assign");
  invariant(objAssign instanceof ECMAScriptFunctionValue);
  let objectAssignCall = objAssign.$Call;
  invariant(objectAssignCall !== undefined);

  // Use the existing internal Prepack Object.assign model
  objectAssignCall(realm.intrinsics.undefined, [to, ...sources]);
}

// In firstRenderOnly mode, we strip off onEventHanlders and any props
// that are functions as they are not required for init render.
export function canExcludeReactElementObjectProperty(
  realm: Realm,
  reactElement: ObjectValue,
  name: string,
  value: Value
): boolean {
  let reactElementData = realm.react.reactElements.get(reactElement);
  invariant(reactElementData !== undefined);
  let { firstRenderOnly } = reactElementData;
  let isHostComponent = getProperty(realm, reactElement, "type") instanceof StringValue;
  return firstRenderOnly && isHostComponent && (isEventProp(name) || value instanceof FunctionValue);
}

export function cloneReactElement(realm: Realm, reactElement: ObjectValue, shouldCloneProps: boolean): ObjectValue {
  let typeValue = getProperty(realm, reactElement, "type");
  let keyValue = getProperty(realm, reactElement, "key");
  let refValue = getProperty(realm, reactElement, "ref");
  let propsValue = getProperty(realm, reactElement, "props");

  invariant(propsValue instanceof ObjectValue);
  if (shouldCloneProps) {
    propsValue = cloneProps(realm, propsValue);
  }
  return createInternalReactElement(realm, typeValue, keyValue, refValue, propsValue);
}

// This function changes an object's property value by changing it's binding
// and descriptor, thus bypassing the binding detection system. This is a
// dangerous function and should only be used on objects created by React.
// It's primary use is to update ReactElement / React props properties
// during the visitor equivalence stage as an optimization feature.
// It will invariant if used on objects that are not final.
export function hardModifyReactObjectPropertyBinding(
  realm: Realm,
  object: ObjectValue,
  propName: string,
  value: Value
): void {
  invariant(
    object.mightBeFinalObject() && !object.mightNotBeFinalObject(),
    "hardModifyReactObjectPropertyBinding can only be used on final objects!"
  );
  let binding = object.properties.get(propName);
  if (binding === undefined) {
    binding = {
      object,
      descriptor: new PropertyDescriptor({
        configurable: true,
        enumerable: true,
        value: undefined,
        writable: true,
      }),
      key: propName,
    };
  }
  let descriptor = binding.descriptor;
  invariant(descriptor instanceof PropertyDescriptor && IsDataDescriptor(realm, descriptor));
  let newDescriptor = new PropertyDescriptor(descriptor);
  newDescriptor.value = value;
  let newBinding = Object.assign({}, binding, {
    descriptor: newDescriptor,
  });
  object.properties.set(propName, newBinding);
}
