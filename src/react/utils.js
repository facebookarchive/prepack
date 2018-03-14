/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

import { Realm, type Effects } from "../realm.js";
import { FunctionEnvironmentRecord, Reference } from "../environment.js";
import { Completion, PossiblyNormalCompletion, AbruptCompletion } from "../completions.js";
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
  UndefinedValue,
  BooleanValue,
} from "../values/index.js";
import type { BabelTraversePath } from "babel-traverse";
import { Generator } from "../utils/generator.js";
import type { Descriptor, ReactHint, PropertyBinding, ReactComponentTreeConfig } from "../types";
import { Get, cloneDescriptor } from "../methods/index.js";
import { computeBinary } from "../evaluators/BinaryExpression.js";
import type { ReactSerializerState, AdditionalFunctionEffects, ReactEvaluatedNode } from "../serializer/types.js";
import invariant from "../invariant.js";
import { Create, Properties, Environment } from "../singletons.js";
import traverse from "babel-traverse";
import * as t from "babel-types";
import type { BabelNodeStatement } from "babel-types";
import { CompilerDiagnostic, FatalError } from "../errors.js";
import { ExpectedBailOut } from "./errors.js";
import { To } from "../singletons.js";
import AbstractValue from "../values/AbstractValue";

export type ReactSymbolTypes =
  | "react.element"
  | "react.context"
  | "react.provider"
  | "react.fragment"
  | "react.portal"
  | "react.return"
  | "react.call";

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
  if (val.properties.has("$$typeof")) {
    let $$typeof = Get(realm, val, "$$typeof");
    let globalObject = realm.$GlobalObject;
    let globalSymbolValue = Get(realm, globalObject, "Symbol");

    if (globalSymbolValue === realm.intrinsics.undefined) {
      if ($$typeof instanceof NumberValue) {
        return $$typeof.value === 0xeac7;
      }
    } else if ($$typeof instanceof SymbolValue) {
      let symbolFromRegistry = realm.globalSymbolRegistry.find(e => e.$Symbol === $$typeof);
      let _isReactElement = symbolFromRegistry !== undefined && symbolFromRegistry.$Key === "react.element";
      if (_isReactElement) {
        // add to Set to speed up future lookups
        realm.react.reactElements.add(val);
        return true;
      }
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
  complexComponentType: ECMAScriptSourceFunctionValue,
  additionalFunctionEffects: AdditionalFunctionEffects
): void {
  let prototype = complexComponentType.properties.get("prototype");
  invariant(prototype);
  invariant(prototype.descriptor);
  prototype.descriptor.configurable = true;
  Properties.DeletePropertyOrThrow(realm, complexComponentType, "prototype");

  // fix the length as we've changed the arguments
  let lengthProperty = GetDescriptorForProperty(complexComponentType, "length");
  invariant(lengthProperty);
  lengthProperty.writable = false;
  lengthProperty.enumerable = false;
  lengthProperty.configurable = true;
  // ensure the length value is set to the new value
  let lengthValue = Get(realm, complexComponentType, "length");
  invariant(lengthValue instanceof NumberValue);
  lengthValue.value = 2;

  // change the function kind
  complexComponentType.$FunctionKind = "normal";
  // set the prototype back to an object
  complexComponentType.$Prototype = realm.intrinsics.FunctionPrototype;
  // give the function the functional components params
  complexComponentType.$FormalParameters = [t.identifier("props"), t.identifier("context")];
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
    newProperties.set(propertyName, createBinding(cloneDescriptor(descriptor), propertyName, object));
  }
  return newProperties;
}

function cloneSymbols(realm: Realm, symbols: Map<SymbolValue, any>, object: ObjectValue): Map<SymbolValue, any> {
  let newSymbols = new Map();
  for (let [symbol, { descriptor }] of symbols) {
    newSymbols.set(symbol, createBinding(cloneDescriptor(descriptor), symbol, object));
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
  functionalComponentType: ECMAScriptSourceFunctionValue,
  complexComponentType: void | ECMAScriptSourceFunctionValue,
  additionalFunctionEffects: AdditionalFunctionEffects
): void {
  invariant(complexComponentType instanceof ECMAScriptSourceFunctionValue);
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
  additionalFunctionEffects.transforms.push((body: Array<BabelNodeStatement>) => {
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

export function getComponentTypeFromRootValue(realm: Realm, value: Value): ECMAScriptSourceFunctionValue | null {
  let _valueIsKnownReactAbstraction = valueIsKnownReactAbstraction(realm, value);
  if (!(value instanceof ECMAScriptSourceFunctionValue || _valueIsKnownReactAbstraction)) {
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

export function evaluateComponentTreeBranch(
  realm: Realm,
  effects: Effects,
  nested: boolean,
  f: (generator?: Generator, value?: Value | Reference | Completion) => void | Value
) {
  let [
    value,
    generator,
    modifiedBindings,
    modifiedProperties: Map<PropertyBinding, void | Descriptor>,
    createdObjects,
  ] = effects;
  if (nested) {
    realm.applyEffects([
      value,
      new Generator(realm, "evaluateComponentTreeBranch"),
      modifiedBindings,
      modifiedProperties,
      createdObjects,
    ]);
  }
  try {
    return f(generator, value);
  } finally {
    if (nested) {
      realm.restoreBindings(modifiedBindings);
      realm.restoreProperties(modifiedProperties);
    }
  }
}

export function setProperty(
  realm: Realm,
  object: ObjectValue | AbstractObjectValue,
  property: string | SymbolValue,
  value: Value
): void {
  if (object instanceof AbstractObjectValue) {
    let elements = object.values.getElements();
    if (elements && elements.size > 0) {
      object = Array.from(elements)[0];
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
    return;
  }
  let descriptor = binding.descriptor;

  if (!descriptor) {
    return;
  }
  descriptor.value = value;
}

export function getProperty(
  realm: Realm,
  object: ObjectValue | AbstractObjectValue,
  property: string | SymbolValue
): Value {
  if (object instanceof AbstractObjectValue) {
    let elements = object.values.getElements();
    if (elements && elements.size > 0) {
      object = Array.from(elements)[0];
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
  let value;
  if (descriptor.value) {
    value = descriptor.value;
  } else if (descriptor.get || descriptor.set) {
    AbstractValue.reportIntrospectionError(object, `react/utils/getProperty unsupported getter/setter property`);
    throw new FatalError();
  }
  invariant(value instanceof Value, `react/utils/getProperty should not be called on internal properties`);
  return value;
}

type FunctionBindingInfo = {
  unboundReads: Set<string>,
  unboundWrites: Set<string>,
};

function visitName(path, state, name, read, write) {
  // Is the name bound to some local identifier? If so, we don't need to do anything
  if (path.scope.hasBinding(name, /*noGlobals*/ true)) return;

  // Otherwise, let's record that there's an unbound identifier
  if (read) state.unboundReads.add(name);
  if (write) state.unboundWrites.add(name);
}

function ignorePath(path: BabelTraversePath) {
  let parent = path.parent;
  return t.isLabeledStatement(parent) || t.isBreakStatement(parent) || t.isContinueStatement(parent);
}

let LeakedClosureRefVisitor = {
  ReferencedIdentifier(path: BabelTraversePath, state: FunctionBindingInfo) {
    if (ignorePath(path)) return;

    let innerName = path.node.name;
    if (innerName === "arguments") {
      return;
    }
    visitName(path, state, innerName, true, false);
  },

  "AssignmentExpression|UpdateExpression"(path: BabelTraversePath, state: FunctionBindingInfo) {
    let doesRead = path.node.operator !== "=";
    for (let name in path.getBindingIdentifiers()) {
      visitName(path, state, name, doesRead, true);
    }
  },
};

function getFunctionBindingInfo(value: FunctionValue) {
  invariant(value instanceof ECMAScriptSourceFunctionValue);
  invariant(value.constructor === ECMAScriptSourceFunctionValue);
  let functionInfo = {
    unboundReads: new Set(),
    unboundWrites: new Set(),
  };
  let formalParameters = value.$FormalParameters;
  invariant(formalParameters != null);
  let code = value.$ECMAScriptCode;
  invariant(code != null);

  traverse(
    t.file(t.program([t.expressionStatement(t.functionExpression(null, formalParameters, code))])),
    LeakedClosureRefVisitor,
    null,
    functionInfo
  );
  return functionInfo;
}

// if a render prop function (a nested additional function) makes
// no accesses to bindings in the parent additional function scope
// we can determine if the function is self contained
export function isRenderPropFunctionSelfContained(
  realm: Realm,
  parentFunc: Value,
  renderProp: FunctionValue,
  logger: any // otherwise Flow cycles increases
): boolean {
  let { unboundReads, unboundWrites } = getFunctionBindingInfo(renderProp);
  let bindings = Array.from(unboundReads).concat(Array.from(unboundWrites));

  for (let name of bindings) {
    let reference = logger.tryQuery(
      () => Environment.ResolveBinding(realm, name, true, renderProp.$Environment),
      undefined
    );
    if (!reference) {
      return false;
    }
    if (reference.base instanceof FunctionEnvironmentRecord && reference.base.$FunctionObject === parentFunc) {
      return false;
    }
  }
  return true;
}

export function createReactEvaluatedNode(
  status:
    | "ROOT"
    | "NEW_TREE"
    | "INLINED"
    | "BAIL-OUT"
    | "UNKNOWN_TYPE"
    | "RENDER_PROPS"
    | "UNSUPPORTED_COMPLETION"
    | "ABRUPT_COMPLETION"
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
  invariant(
    componentType instanceof ECMAScriptSourceFunctionValue ||
      componentType instanceof AbstractObjectValue ||
      componentType instanceof AbstractValue
  );
  if (componentType.__originalName) {
    return componentType.__originalName;
  }
  if (realm.fbLibraries.reactRelay !== undefined) {
    if (componentType === Get(realm, realm.fbLibraries.reactRelay, "QueryRenderer")) {
      return "QueryRenderer";
    }
  }
  if (componentType instanceof ECMAScriptSourceFunctionValue) {
    let name = Get(realm, componentType, "name");

    if (name instanceof StringValue) {
      return name.value;
    }
  }
  return "Unknown";
}

export function convertConfigObjectToReactComponentTreeConfig(
  realm: Realm,
  config: ObjectValue | UndefinedValue
): ReactComponentTreeConfig {
  // defaults
  let firstRenderOnly = false;

  if (!(config instanceof UndefinedValue)) {
    for (let [key] of config.properties) {
      let propValue = getProperty(realm, config, key);
      if (propValue instanceof StringValue || propValue instanceof NumberValue || propValue instanceof BooleanValue) {
        let value = propValue.value;

        // boolean options
        if (typeof value === "boolean") {
          if (key === "firstRenderOnly") {
            firstRenderOnly = value;
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
  };
}

export function getValueFromRenderCall(
  realm: Realm,
  renderFunction: ECMAScriptSourceFunctionValue,
  instance: ObjectValue | AbstractObjectValue | UndefinedValue,
  args: Array<Value>,
  componentTreeConfig: ReactComponentTreeConfig
): Value {
  invariant(renderFunction.$Call, "Expected render function to be a FunctionValue with $Call method");
  let funcCall = renderFunction.$Call;
  let effects;
  try {
    effects = realm.evaluateForEffects(() => funcCall(instance, args), null, "component render");
  } catch (error) {
    throw error;
  }
  let completion = effects[0];
  if (completion instanceof PossiblyNormalCompletion) {
    // in this case one of the branches may complete abruptly, which means that
    // not all control flow branches join into one flow at this point.
    // Consequently we have to continue tracking changes until the point where
    // all the branches come together into one.
    completion = realm.composeWithSavedCompletion(completion);
  }
  // the render method doesn't have any arguments, so we just assign the context of "this" to be the instance
  if (componentTreeConfig.firstRenderOnly && completion instanceof AbstractValue && completion.args.length === 0) {
    throw new ExpectedBailOut("completely unknown component render currently supported on first render");
  }
  // Note that the effects of (non joining) abrupt branches are not included
  // in joinedEffects, but are tracked separately inside completion.
  realm.applyEffects(effects);
  // return or throw completion
  if (completion instanceof AbruptCompletion) throw completion;
  invariant(completion instanceof Value);
  return completion;
}

function isEventProp(name: string): boolean {
  return name.length > 2 && name[0].toLowerCase() === "o" && name[1].toLowerCase() === "n";
}

export function sanitizeReactElementForFirstRenderOnly(realm: Realm, reactElement: ObjectValue): ObjectValue {
  let typeValue = Get(realm, reactElement, "type");

  // ensure ref is null, as we don't use that on first render
  setProperty(realm, reactElement, "ref", realm.intrinsics.null);
  // when dealing with host nodes, we want to sanitize them futher
  if (typeValue instanceof StringValue) {
    let propsValue = Get(realm, reactElement, "props");
    if (propsValue instanceof ObjectValue) {
      // remove all values apart from string/number/boolean
      for (let [propName] of propsValue.properties) {
        // check for onSomething prop event handlers, i.e. onClick
        if (isEventProp(propName)) {
          propsValue.$Delete(propName);
        }
      }
    }
  }
  return reactElement;
}
