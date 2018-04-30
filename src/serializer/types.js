/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

import { DeclarativeEnvironmentRecord, type Binding } from "../environment.js";
import { ConcreteValue, Value, ObjectValue, AbstractValue } from "../values/index.js";
import type { ECMAScriptSourceFunctionValue, FunctionValue } from "../values/index.js";
import type { BabelNodeExpression, BabelNodeStatement } from "babel-types";
import { SameValue } from "../methods/abstract.js";
import { Realm, type Effects } from "../realm.js";
import invariant from "../invariant.js";
import type { Generator } from "../utils/generator.js";
import { type SerializerStatistics } from "./statistics.js";

export type TryQuery<T> = (f: () => T, defaultValue: T) => T;

// TODO: add type for additional functions.
export type SerializedBodyType =
  | "MainGenerator"
  | "Generator"
  | "AdditionalFunction"
  | "DelayInitializations"
  | "ConditionalAssignmentBranch"
  | "LazyObjectInitializer";

export type SerializedBody = {
  type: SerializedBodyType,
  entries: Array<BabelNodeStatement>,
  done: boolean,
  declaredAbstractValues?: Map<AbstractValue, SerializedBody>,
  parentBody?: SerializedBody,
  nestingLevel?: number,
};

export type AdditionalFunctionEffects = {
  // All of these effects must be applied for this additional function
  // to be properly setup
  parentAdditionalFunction: FunctionValue | void,
  effects: Effects,
  generator: Generator,
  transforms: Array<Function>,
  additionalRoots: Set<ObjectValue>,
};

export type AdditionalFunctionInfo = {
  functionValue: FunctionValue,
  captures: Set<string>,
  // TODO: use for storing modified residual function bindings (captured by other functions)
  modifiedBindings: Map<Binding, ResidualFunctionBinding>,
  instance: FunctionInstance,
  hasReturn: boolean,
};

export type ClassMethodInstance = {|
  classPrototype: ObjectValue,
  methodType: "constructor" | "method" | "get" | "set",
  classSuperNode: void | BabelNodeIdentifier,
  classMethodIsStatic: boolean,
  classMethodKeyNode: void | BabelNodeExpression,
  classMethodComputed: boolean,
|};

// Each of these will correspond to a different preludeGenerator and thus will
// have different values available for initialization. FunctionValues should
// only be additional functions.
export type ReferentializationScope = FunctionValue | "GLOBAL";

export type FunctionInstance = {
  residualFunctionBindings: Map<string, ResidualFunctionBinding>,
  functionValue: ECMAScriptSourceFunctionValue,
  insertionPoint?: BodyReference,
  // Additional function that the function instance was declared inside of (if any)
  containingAdditionalFunction?: FunctionValue,
  scopeInstances: Map<string, ScopeBinding>,
  initializationStatements: Array<BabelNodeStatement>,
};

export type FunctionInfo = {
  depth: number,
  unbound: Set<string>,
  modified: Set<string>,
  usesArguments: boolean,
  usesThis: boolean,
};

export type LazilyHoistedNodes = {|
  id: BabelNodeIdentifier,
  createElementIdentifier: null | BabelNodeIdentifier,
  nodes: Array<{ id: BabelNodeIdentifier, astNode: BabelNode }>,
|};

export type FactoryFunctionInfo = {
  factoryId: BabelNodeIdentifier,
  functionInfo: FunctionInfo,
  anyContainingAdditionalFunction: boolean,
};

export type ResidualFunctionBinding = {
  name: string,
  value: void | Value,
  modified: boolean,
  // null means a global binding
  declarativeEnvironmentRecord: null | DeclarativeEnvironmentRecord,
  // The serializedValue is only not yet present during the initialization of a binding that involves recursive dependencies.
  serializedValue?: void | BabelNodeExpression,
  referentialized?: boolean,
  scope?: ScopeBinding,
  // Which additional functions a binding is accessed by. (Determines what initializer
  // to put the binding in -- global or additional function)
  potentialReferentializationScopes: Set<ReferentializationScope>,
  // If the binding is overwritten by an additional function, these contain the
  // new values
  // TODO #1087: make this a map and support arbitrary binding modifications
  additionalFunctionOverridesValue?: FunctionValue,
};

export type ScopeBinding = {
  name: string,
  id: number,
  initializationValues: Array<BabelNodeExpression>,
  capturedScope?: string,
  referentializationScope: ReferentializationScope,
};

export function AreSameResidualBinding(realm: Realm, x: ResidualFunctionBinding, y: ResidualFunctionBinding) {
  if (x.serializedValue === y.serializedValue) return true;
  if (x.value && x.value === y.value) return true;
  if (x.value instanceof ConcreteValue && y.value instanceof ConcreteValue) {
    return SameValue(realm, x.value, y.value);
  }
  return false;
}

export class BodyReference {
  constructor(body: SerializedBody, index: number) {
    invariant(index >= 0);
    this.body = body;
    this.index = index;
  }
  isNotEarlierThan(other: BodyReference): boolean {
    return this.body === other.body && this.index >= other.index;
  }
  body: SerializedBody;
  index: number;
}

export type ReactEvaluatedNode = {
  children: Array<ReactEvaluatedNode>,
  message: string,
  name: string,
  status:
    | "ROOT"
    | "NEW_TREE"
    | "INLINED"
    | "BAIL-OUT"
    | "WRITE-CONFLICTS"
    | "UNKNOWN_TYPE"
    | "RENDER_PROPS"
    | "FORWARD_REF"
    | "UNSUPPORTED_COMPLETION"
    | "ABRUPT_COMPLETION"
    | "NORMAL",
};

export class ReactStatistics {
  constructor() {
    this.optimizedTrees = 0;
    this.inlinedComponents = 0;
    this.evaluatedRootNodes = [];
    this.componentsEvaluated = 0;
    this.optimizedNestedClosures = 0;
  }
  optimizedTrees: number;
  inlinedComponents: number;
  evaluatedRootNodes: Array<ReactEvaluatedNode>;
  componentsEvaluated: number;
  optimizedNestedClosures: number;
}

export type LocationService = {
  getLocation: Value => BabelNodeIdentifier,
  createLocation: () => BabelNodeIdentifier,
};

export type ReactSerializerState = {
  usedReactElementKeys: Set<string>,
};

export type ObjectRefCount = {
  inComing: number, // The number of objects that references this object.
  outGoing: number, // The number of objects that are referenced by this object.
};

export type SerializedResult = {
  code: string,
  map: void | SourceMap,
  statistics?: SerializerStatistics,
  reactStatistics?: ReactStatistics,
  heapGraph?: string,
};
