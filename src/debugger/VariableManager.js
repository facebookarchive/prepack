/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

import type { VariableContainer, Variable } from "./types.js";
import { ReferenceMap } from "./ReferenceMap.js";
import { LexicalEnvironment, DeclarativeEnvironmentRecord } from "./../environment.js";
import { Value, ConcreteValue, PrimitiveValue } from "./../values/index.js";

// This class manages the handling of variable requests in the debugger
// The DebugProtocol specifies collections of variables are to be fetched using a
// unique reference ID called a variablesReference. This class can generate new
// variablesReferences to pass to the UI and then perform lookups for those
// variablesReferences when they are requested.
export class VariableManager {
  constructor() {
    this._containerCache = new Map();
    this._referenceMap = new ReferenceMap();
  }
  // cache for created references
  _containerCache: Map<VariableContainer, number>;
  // map for looking up references
  _referenceMap: ReferenceMap<VariableContainer>;

  // Given a container, either returns a cached reference for that container if
  // it exists or return a new reference
  getReferenceForValue(value: VariableContainer): number {
    let cachedRef = this._containerCache.get(value);
    if (cachedRef !== undefined) {
      return cachedRef;
    }

    let varRef = this._referenceMap.add(value);
    this._containerCache.set(value, varRef);
    return varRef;
  }

  // The entry point for retrieving a collection of variables by a reference
  getVariablesByReference(reference: number): Array<Variable> {
    let container = this._referenceMap.get(reference);
    if (!container) return [];
    if (container instanceof LexicalEnvironment) {
      return this._getVariablesFromEnv(container);
    }
    // TODO: implement retrieving variables for other types of containers
    return [];
  }

  _getVariablesFromEnv(env: LexicalEnvironment): Array<Variable> {
    let envRecord = env.environmentRecord;
    if (envRecord instanceof DeclarativeEnvironmentRecord) {
      return this._getVariablesFromDeclarativeEnv(envRecord);
    }
    // TODO: implement retrieving variables for other kinds of environment records
    return [];
  }

  _getVariablesFromDeclarativeEnv(env: DeclarativeEnvironmentRecord): Array<Variable> {
    let variables = [];
    let bindings = env.bindings;
    for (let name in bindings) {
      let binding = bindings[name];
      if (binding.value) {
        let displayValue = this._getDisplayValue(binding.value);
        let variable: Variable = {
          name: name,
          value: displayValue,
          variablesReference: 0,
        };
        variables.push(variable);
      }
    }
    return variables;
  }

  _getDisplayValue(value: Value): string {
    let displayValue = "to be supported";
    if (value instanceof ConcreteValue) {
      displayValue = this._getConcreteDisplayValue(value);
    }
    return displayValue;
  }

  _getConcreteDisplayValue(value: ConcreteValue): string {
    if (value instanceof PrimitiveValue) {
      return value.toDisplayString();
    }
    return "to be supported";
  }

  clean() {
    this._containerCache = new Map();
    this._referenceMap.clean();
  }
}
