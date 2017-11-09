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

export class VariableFactory {
  constructor() {
    this._referenceMap = new ReferenceMap();
  }
  _referenceMap: ReferenceMap<VariableContainer>;

  createReference(value: VariableContainer): number {
    return this._referenceMap.add(value);
  }

  getVariablesByReference(reference: number): Array<Variable> {
    let container = this._referenceMap.get(reference);
    if (!container) return [];
    if (container instanceof LexicalEnvironment) {
      return this._getVariablesFromEnv(container);
    }
    return [];
  }

  _getVariablesFromEnv(env: LexicalEnvironment): Array<Variable> {
    let envRecord = env.environmentRecord;
    if (envRecord instanceof DeclarativeEnvironmentRecord) {
      return this._getVariablesFromDeclarativeEnv(envRecord);
    }
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
}
