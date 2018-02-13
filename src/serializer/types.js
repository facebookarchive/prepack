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

export type TryQuery<T> = (f: () => T, defaultValue: T) => T;

// TODO: add type for additional functions.
export type SerializedBodyType =
  | "MainGenerator"
  | "Generator"
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
  effects: Effects,
  transforms: Array<Function>,
};

export type AdditionalFunctionInfo = {
  functionValue: FunctionValue,
  captures: Set<string>,
  // TODO: use for storing modified residual function bindings (captured by other functions)
  modifiedBindings: Map<Binding, ResidualFunctionBinding>,
  instance: FunctionInstance,
};

export type ClassMethodInstance = {|
  classPrototype: ObjectValue,
  methodType: "constructor" | "method" | "get" | "set",
  classSuperNode: void | BabelNodeIdentifier,
  classMethodIsStatic: boolean,
  classMethodKeyNode: void | BabelNodeExpression,
  classMethodComputed: boolean,
|};

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

export type FactoryFunctionInfo = { factoryId: BabelNodeIdentifier, functionInfo: FunctionInfo };

export type ResidualFunctionBinding = {
  value: void | Value,
  modified: boolean,
  // null means a global binding
  declarativeEnvironmentRecord: null | DeclarativeEnvironmentRecord,
  // The serializedValue is only not yet present during the initialization of a binding that involves recursive dependencies.
  serializedValue?: void | BabelNodeExpression,
  referentialized?: boolean,
  scope?: ScopeBinding,
  // If the binding is only accessed by an additional function or nested values
  // this field contains that additional function. (Determines what initializer
  // to put the binding in -- global or additional function)
  referencedOnlyFromAdditionalFunctions?: FunctionValue,
  // If the binding is overwritten by an additional function, these contain the
  // new values
  // TODO #1087: make this a map and support arbitrary binding modifications
  additionalFunctionOverridesValue?: true,
  additionalValueSerialized?: BabelNodeExpression,
};

export type ScopeBinding = {
  name: string,
  id: number,
  initializationValues: Array<BabelNodeExpression>,
  capturedScope?: string,
  containingAdditionalFunction: void | FunctionValue,
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

export class TimingStatistics {
  constructor() {
    this.totalTime = 0;
    this.globalCodeTime = 0;
    this.initializeMoreModulesTime = 0;
    this.deepTraversalTime = 0;
    this.referenceCountsTime = 0;
    this.serializePassTime = 0;
  }
  totalTime: number;
  globalCodeTime: number;
  initializeMoreModulesTime: number;
  deepTraversalTime: number;
  referenceCountsTime: number;
  serializePassTime: number;
}

export class ReactStatistics {
  constructor() {
    this.optimizedTrees = 0;
    this.inlinedComponents = 0;
  }
  optimizedTrees: number;
  inlinedComponents: number;
}

export class SerializerStatistics {
  constructor() {
    this.objects = 0;
    this.objectProperties = 0;
    this.functions = 0;
    this.functionClones = 0;
    this.referentialized = 0;
    this.valueIds = 0;
    this.valuesInlined = 0;
    this.delayedValues = 0;
    this.acceleratedModules = 0;
    this.delayedModules = 0;
  }
  objects: number;
  objectProperties: number;
  functions: number;
  functionClones: number;
  referentialized: number;
  valueIds: number;
  valuesInlined: number;
  delayedValues: number;
  acceleratedModules: number;
  delayedModules: number;

  log() {
    console.log(`=== serialization statistics`);
    console.log(`${this.objects} objects with ${this.objectProperties} properties`);
    console.log(
      `${this.functions} functions plus ${this.functionClones} clones due to captured variables; ${this
        .referentialized} captured mutable variables`
    );
    console.log(
      `${this.valueIds} eager and ${this.delayedValues} delayed value ids generated, and ${this
        .valuesInlined} values inlined`
    );
    console.log(`${this.acceleratedModules} accelerated and ${this.delayedModules} delayed modules.`);
  }
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
  timingStats?: TimingStatistics,
  heapGraph?: string,
};
