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
import { ConcreteValue, Value } from "../values/index.js";
import type { ECMAScriptSourceFunctionValue, FunctionValue } from "../values/index.js";
import type { BabelNodeExpression, BabelNodeStatement } from "babel-types";
import { SameValue } from "../methods/abstract.js";
import { Realm } from "../realm.js";
import invariant from "../invariant.js";

export type TryQuery<T> = (f: () => T, defaultValue: T, logFailures: boolean) => T;

export type AdditionalFunctionInfo = {
  functionValue: FunctionValue,
  captures: Names,
  // TODO: use for storing modified residual function bindings (captured by other functions)
  modifiedBindings: Map<Binding, ResidualFunctionBinding>,
  instance: FunctionInstance,
};

export type FunctionInstance = {
  residualFunctionBindings: Map<string, ResidualFunctionBinding>,
  functionValue: ECMAScriptSourceFunctionValue,
  insertionPoint?: BodyReference,
  // Optional place to put the function declaration
  preludeOverride?: Array<BabelNodeStatement>,
  additionalFunction?: FunctionValue,
  scopeInstances: Set<ScopeBinding>,
};

export type FunctionInfo = {
  unbound: Set<string>,
  modified: Set<string>,
  usesArguments: boolean,
  usesThis: boolean,
};

export type ResidualFunctionBinding = {
  value: void | Value,
  modified: boolean,
  // void means a global binding
  declarativeEnvironmentRecord: null | DeclarativeEnvironmentRecord,
  // an additional function may overwrite the value of this binding
  additionalValue?: null | Value,
  // The serializedValue is only not yet present during the initialization of a binding that involves recursive dependencies.
  serializedValue?: void | BabelNodeExpression,
  referentialized?: boolean,
  // Additional function value co
  referencedOnlyFromAdditionalFunctions?: FunctionValue,
  scope?: ScopeBinding,
};

export type ScopeBinding = {
  name: string,
  id: number,
  initializationValues: Array<BabelNodeExpression>,
  capturedScope?: string,
  containingAdditionalFunction: void | FunctionValue,
};

export type GeneratorBody = Array<BabelNodeStatement>;

export function AreSameResidualBinding(realm: Realm, x: ResidualFunctionBinding, y: ResidualFunctionBinding) {
  if (x.serializedValue === y.serializedValue) return true;
  if (x.value && x.value === y.value) return true;
  if (x.value instanceof ConcreteValue && y.value instanceof ConcreteValue) {
    return SameValue(realm, x.value, y.value);
  }
  return false;
}

export class BodyReference {
  constructor(body: Array<BabelNodeStatement>, index: number) {
    invariant(index >= 0);
    this.body = body;
    this.index = index;
  }
  isNotEarlierThan(other: BodyReference): boolean {
    return this.body === other.body && this.index >= other.index;
  }
  body: Array<BabelNodeStatement>;
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
  getLocation: Value => void | BabelNodeIdentifier,
  createLocation: () => BabelNodeIdentifier,
};
