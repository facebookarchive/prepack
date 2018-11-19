/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow strict-local */

import { RealmStatistics, PerformanceTracker } from "../statistics.js";

export class SerializerStatistics extends RealmStatistics {
  constructor(getTime: void | (() => number), getMemory: void | (() => number), forcingGC: boolean = false) {
    super(getTime, getMemory);
    this.forcingGC = forcingGC;

    this.functions = 0;
    this.delayedValues = 0;
    this.initializedModules = 0;
    this.acceleratedModules = 0;
    this.delayedModules = 0;
    this.totalModules = 0;
    this.resetBeforePass();

    this.total = new PerformanceTracker(getTime, getMemory);
    this.resolveInitializedModules = new PerformanceTracker(getTime, getMemory);
    this.modulesToInitialize = new PerformanceTracker(getTime, getMemory);
    this.optimizeReactComponentTreeRoots = new PerformanceTracker(getTime, getMemory);
    this.checkThatFunctionsAreIndependent = new PerformanceTracker(getTime, getMemory);
    this.processCollectedNestedOptimizedFunctions = new PerformanceTracker(getTime, getMemory);
    this.deepTraversal = new PerformanceTracker(getTime, getMemory);
    this.referentialization = new PerformanceTracker(getTime, getMemory);
    this.referenceCounts = new PerformanceTracker(getTime, getMemory);
    this.serializePass = new PerformanceTracker(getTime, getMemory);
    this.babelGenerate = new PerformanceTracker(getTime, getMemory);
    this.dumpIR = new PerformanceTracker(getTime, getMemory);
  }

  resetBeforePass(): void {
    this.objects = 0;
    this.objectProperties = 0;
    this.functionClones = 0;
    this.lazyObjects = 0;
    this.referentialized = 0;
    this.valueIds = 0;
    this.valuesInlined = 0;
    this.generators = 0;
    this.requireCalls = 0;
    this.requireCallsReplaced = 0;
  }

  forcingGC: boolean;

  objects: number;
  objectProperties: number;
  functions: number;
  functionClones: number;
  lazyObjects: number;
  referentialized: number;
  valueIds: number;
  valuesInlined: number;
  delayedValues: number;
  initializedModules: number;
  acceleratedModules: number;
  delayedModules: number;
  totalModules: number;
  generators: number;
  requireCalls: number;
  requireCallsReplaced: number;

  // legacy projection
  getSerializerStatistics() {
    return {
      objects: this.objects,
      objectProperties: this.objectProperties,
      functions: this.functions,
      functionClones: this.functionClones,
      lazyObjects: this.lazyObjects,
      referentialized: this.referentialized,
      valueIds: this.valueIds,
      valuesInlined: this.valuesInlined,
      delayedValues: this.delayedValues,
      initializedModules: this.initializedModules,
      acceleratedModules: this.acceleratedModules,
      delayedModules: this.delayedModules,
      totalModules: this.totalModules,
      generators: this.generators,
      requireCalls: this.requireCalls,
      requireCallsReplaced: this.requireCallsReplaced,
    };
  }

  total: PerformanceTracker;
  resolveInitializedModules: PerformanceTracker;
  modulesToInitialize: PerformanceTracker;
  optimizeReactComponentTreeRoots: PerformanceTracker;
  checkThatFunctionsAreIndependent: PerformanceTracker;
  processCollectedNestedOptimizedFunctions: PerformanceTracker;
  deepTraversal: PerformanceTracker;
  referenceCounts: PerformanceTracker;
  referentialization: PerformanceTracker;
  serializePass: PerformanceTracker;
  babelGenerate: PerformanceTracker;
  dumpIR: PerformanceTracker;

  log(): void {
    super.log();
    console.log(`=== serialization statistics`);
    console.log(`${this.objects} objects with ${this.objectProperties} properties`);
    console.log(
      `${this.functions} functions plus ${this.functionClones} clones due to captured variables; ${
        this.referentialized
      } captured mutable variables`
    );
    console.log(`${this.lazyObjects} objects are lazy.`);
    console.log(
      `${this.valueIds} eager and ${this.delayedValues} delayed value ids generated, and ${
        this.valuesInlined
      } values inlined.`
    );
    console.log(
      `${this.initializedModules} out of ${this.totalModules} modules initialized, with ${
        this.acceleratedModules
      } accelerated and ${this.delayedModules} delayed.`
    );
    console.log(`${this.requireCallsReplaced} of ${this.requireCalls} require calls inlined.`);
    console.log(`${this.generators} generators`);
  }

  logSerializerPerformanceTrackers(title: string, note: void | string, format: PerformanceTracker => string): void {
    console.log(`=== ${title}: ${format(this.total)} total`);
    if (note !== undefined) console.log(`NOTE: ${note}`);
    this.logPerformanceTrackers(format);
    console.log(
      `${format(this.resolveInitializedModules)} resolving initialized modules, ${format(
        this.modulesToInitialize
      )} initializing more modules, ${format(
        this.optimizeReactComponentTreeRoots
      )} optimizing react component tree roots, ${format(
        this.checkThatFunctionsAreIndependent
      )} evaluating functions to optimize, ${format(this.dumpIR)} dumping IR`
    );
    console.log(
      `${format(this.deepTraversal)} visiting residual heap, ${format(
        this.referentialization
      )} referentializing functions, ${format(this.referenceCounts)} reference counting, ${format(
        this.serializePass
      )} generating AST, ${format(this.babelGenerate)} generating source code`
    );
  }
}
