/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

import { FunctionValue } from "../values/index.js";
import type { AdditionalFunctionEffects } from "./types";
import invariant from "../invariant.js";
import { GeneratorTree } from "./GeneratorTree";
import type { Scope } from "./types.js";
import { FunctionEnvironmentRecord } from "../environment";
import type { Value } from "../values/index";
import { Generator } from "../utils/generator";

export class ResidualOptimizedFunctions {
  constructor(
    generatorTree: GeneratorTree,
    optimizedFunctionsAndEffects: Map<FunctionValue, AdditionalFunctionEffects>,
    residualValues: Map<Value, Set<Scope>>
  ) {
    this._generatorTree = generatorTree;
    this._optimizedFunctionsAndEffects = optimizedFunctionsAndEffects;
    this._residualValues = residualValues;
  }

  _generatorTree: GeneratorTree;
  _optimizedFunctionsAndEffects: Map<FunctionValue, AdditionalFunctionEffects>;
  _residualValues: Map<Value, Set<Scope>>;

  _isDefinedInsideFunction(childFunction: FunctionValue, maybeParentFunctions: Set<FunctionValue>): boolean {
    for (let maybeParentFunction of maybeParentFunctions) {
      if (childFunction === maybeParentFunction) {
        continue;
      }
      // for optimized functions, we should use created objects
      let maybeParentFunctionInfo = this._optimizedFunctionsAndEffects.get(maybeParentFunction);
      if (maybeParentFunctionInfo && maybeParentFunctionInfo.effects.createdObjects.has(childFunction)) return true;
      else {
        // for other functions, check environment records
        let env = childFunction.$Environment;
        while (env.parent !== null) {
          let envRecord = env.environmentRecord;
          if (envRecord instanceof FunctionEnvironmentRecord && envRecord.$FunctionObject === maybeParentFunction)
            return true;
          env = env.parent;
        }
      }
    }
    return false;
  }

  // Check if an optimized function defines the given set of functions.
  _definesFunctions(possibleParentFunction: FunctionValue, functions: Set<FunctionValue>): boolean {
    let maybeParentFunctionInfo = this._optimizedFunctionsAndEffects.get(possibleParentFunction);
    invariant(maybeParentFunctionInfo);
    let createdObjects = maybeParentFunctionInfo.effects.createdObjects;
    for (let func of functions) if (func !== possibleParentFunction && !createdObjects.has(func)) return false;
    return true;
  }

  // Try and get the root optimized function when passed in an optimized function
  // that may or may not be nested in the tree of said root, or is the root optimized function
  tryGetOptimizedFunctionRoot(val: Value): void | FunctionValue {
    let scopes = this._residualValues.get(val);
    invariant(scopes !== undefined);
    return this.tryGetOutermostOptimizedFunction(scopes);
  }

  // Try and get the optimized function that contains all the scopes passed in (may be one of the
  // scopes passed in)
  tryGetOutermostOptimizedFunction(scopes: Set<Scope>): void | FunctionValue {
    let functionValues = new Set();
    invariant(scopes !== undefined);
    for (let scope of scopes) {
      let s = scope;
      while (s instanceof Generator) {
        s = this._generatorTree.getParent(s);
      }
      if (s === "GLOBAL") return undefined;
      invariant(s instanceof FunctionValue);
      functionValues.add(s);
    }
    let outermostAdditionalFunctions = new Set();

    // Get the set of optimized functions that may be the root

    for (let functionValue of functionValues) {
      if (this._optimizedFunctionsAndEffects.has(functionValue)) {
        if (!this._isDefinedInsideFunction(functionValue, functionValues))
          outermostAdditionalFunctions.add(functionValue);
      } else {
        let f = this.tryGetOptimizedFunctionRoot(functionValue);
        if (f === undefined) return undefined;
        if (!this._isDefinedInsideFunction(f, functionValues)) outermostAdditionalFunctions.add(f);
      }
    }
    if (outermostAdditionalFunctions.size === 1) return [...outermostAdditionalFunctions][0];

    // See if any of the outermost (or any of their parents) are the outermost optimized function
    let possibleRoots = [...outermostAdditionalFunctions];
    while (possibleRoots.length > 0) {
      let possibleRoot = possibleRoots.shift();
      if (this._definesFunctions(possibleRoot, outermostAdditionalFunctions)) return possibleRoot;
      let additionalFunctionEffects = this._optimizedFunctionsAndEffects.get(possibleRoot);
      invariant(additionalFunctionEffects);
      let parent = additionalFunctionEffects.parentAdditionalFunction;
      if (parent) possibleRoots.push(parent);
    }
    return undefined;
  }
}
