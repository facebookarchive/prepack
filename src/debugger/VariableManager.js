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
import { Value, ConcreteValue, PrimitiveValue, ObjectValue } from "./../values/index.js";
import invariant from "./../invariant.js";
import type { Realm } from "./../realm.js";
import { IsDataDescriptor } from "./../methods/is.js";

// This class manages the handling of variable requests in the debugger
// The DebugProtocol specifies collections of variables are to be fetched using a
// unique reference ID called a variablesReference. This class can generate new
// variablesReferences to pass to the UI and then perform lookups for those
// variablesReferences when they are requested.
export class VariableManager {
  constructor(realm: Realm) {
    this._containerCache = new Map();
    this._referenceMap = new ReferenceMap();
    this._realm = realm;
  }
  // cache for created references
  _containerCache: Map<VariableContainer, number>;
  // map for looking up references
  _referenceMap: ReferenceMap<VariableContainer>;
  _realm: Realm;

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
    } else if (container instanceof ObjectValue) {
      return this._getVariablesFromObject(container);
    } else {
      invariant(false, "Invalid variable container");
    }
  }

  _getVariablesFromObject(object: ObjectValue): Array<Variable> {
    let variables = [];
    let names = object.properties.keys();
    for (let name of names) {
      let binding = object.properties.get(name);
      invariant(binding !== undefined);
      if (binding.descriptor) {
        if (IsDataDescriptor(this._realm, binding.descriptor)) {
          let value = binding.descriptor.value;
          if (value instanceof Value) {
            let variable = this._getVariableFromValue(name, value);
            variables.push(variable);
          }
        }
      }
    }
    return variables;
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
        let variable = this._getVariableFromValue(name, binding.value);
        variables.push(variable);
      }
    }
    return variables;
  }

  _getVariableFromValue(name: string, value: Value): Variable {
    if (value instanceof ConcreteValue) {
      return this._getVariableFromConcreteValue(name, value);
    } else {
      invariant(false, "Unsupported type of: " + name);
    }
    // TODO: implement variables request for abstract values
  }

  _getVariableFromConcreteValue(name: string, value: ConcreteValue): Variable {
    if (value instanceof PrimitiveValue) {
      let variable: Variable = {
        name: name,
        value: value.toDisplayString(),
        variablesReference: 0,
      };
      return variable;
    } else if (value instanceof ObjectValue) {
      let variable: Variable = {
        name: name,
        value: "Object",
        variablesReference: this.getReferenceForValue(value),
      };
      return variable;
    } else {
      invariant(false, "Concrete value must be primitive or object");
    }
  }

  clean() {
    this._containerCache = new Map();
    this._referenceMap.clean();
  }
}
