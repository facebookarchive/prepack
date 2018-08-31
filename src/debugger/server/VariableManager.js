/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow strict-local */

import type { Variable, EvaluateResult } from "./../common/types.js";
import { ReferenceMap } from "./ReferenceMap.js";
import {
  LexicalEnvironment,
  EnvironmentRecord,
  DeclarativeEnvironmentRecord,
  ObjectEnvironmentRecord,
  GlobalEnvironmentRecord,
} from "./../../environment.js";
import {
  Value,
  ConcreteValue,
  PrimitiveValue,
  ObjectValue,
  AbstractObjectValue,
  AbstractValue,
  StringValue,
} from "./../../values/index.js";
import invariant from "./../common/invariant.js";
import type { Realm } from "./../../realm.js";
import { IsDataDescriptor } from "./../../methods/is.js";
import { DebuggerError } from "./../common/DebuggerError.js";
import { Functions } from "./../../singletons.js";

type VariableContainer = LexicalEnvironment | ObjectValue | AbstractValue;

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
      return this._getVariablesFromEnvRecord(container.environmentRecord);
    } else if (container instanceof ObjectValue) {
      return this._getVariablesFromObject(container);
    } else if (container instanceof AbstractValue) {
      return this._getAbstractValueContent(container);
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

  _getAbstractValueContent(value: AbstractValue): Array<Variable> {
    let kindVar: Variable = {
      name: "kind",
      value: value.kind || "undefined",
      variablesReference: 0,
    };
    let contents: Array<Variable> = [kindVar];
    let argCount = 1;
    for (let arg of value.args) {
      contents.push(this._getVariableFromValue("arg-" + argCount, arg));
      argCount++;
    }
    return contents;
  }

  _getVariablesFromEnvRecord(envRecord: EnvironmentRecord): Array<Variable> {
    if (envRecord instanceof DeclarativeEnvironmentRecord) {
      return this._getVariablesFromDeclarativeEnv(envRecord);
    } else if (envRecord instanceof ObjectEnvironmentRecord) {
      if (envRecord.object instanceof ObjectValue) {
        return this._getVariablesFromObject(envRecord.object);
      } else if (envRecord.object instanceof AbstractObjectValue) {
        // TODO: call _getVariablesFromAbstractObject when it is implemented
        return [];
      } else {
        invariant(false, "Invalid type of object environment record");
      }
    } else if (envRecord instanceof GlobalEnvironmentRecord) {
      let declVars = this._getVariablesFromEnvRecord(envRecord.$DeclarativeRecord);
      let objVars = this._getVariablesFromEnvRecord(envRecord.$ObjectRecord);
      return declVars.concat(objVars);
    } else {
      invariant(false, "Invalid type of environment record");
    }
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
    } else if (value instanceof AbstractValue) {
      return this._getVariableFromAbstractValue(name, value);
    } else {
      invariant(false, "Value is neither concrete nor abstract");
    }
  }

  _getVariableFromAbstractValue(name: string, value: AbstractValue): Variable {
    let variable: Variable = {
      name: name,
      value: this._getAbstractValueDisplay(value),
      variablesReference: this.getReferenceForValue(value),
    };
    return variable;
  }

  _getAbstractValueDisplay(value: AbstractValue): string {
    if (value.intrinsicName !== undefined && !value.intrinsicName.startsWith("_")) {
      return value.intrinsicName;
    }
    return "Abstract " + value.types.getType().name;
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
        value: value.getKind(),
        variablesReference: this.getReferenceForValue(value),
      };
      return variable;
    } else {
      invariant(false, "Concrete value must be primitive or object");
    }
  }

  evaluate(frameId: void | number, expression: string): EvaluateResult {
    let evalRealm = this._realm;
    let isDirect = false;
    let isStrict = false;
    if (frameId !== undefined) {
      if (frameId < 0 || frameId >= this._realm.contextStack.length) {
        throw new DebuggerError("Invalid command", "Invalid value for frame ID");
      }
      // frameId's are in reverse order of context stack
      let stackIndex = this._realm.contextStack.length - 1 - frameId;
      let context = this._realm.contextStack[stackIndex];
      isDirect = true;
      isStrict = true;
      evalRealm = context.realm;
    }

    let evalString = new StringValue(this._realm, expression);
    try {
      let value = Functions.PerformEval(this._realm, evalString, evalRealm, isStrict, isDirect);
      let varInfo = this._getVariableFromValue(expression, value);
      let result: EvaluateResult = {
        kind: "evaluate",
        displayValue: varInfo.value,
        type: value.getType().name,
        variablesReference: varInfo.variablesReference,
      };
      return result;
    } catch (e) {
      let result: EvaluateResult = {
        kind: "evaluate",
        displayValue: `Failed to evaluate: ${expression}`,
        type: "unknown",
        variablesReference: 0,
      };
      return result;
    }
  }

  clean() {
    this._containerCache = new Map();
    this._referenceMap.clean();
  }
}
