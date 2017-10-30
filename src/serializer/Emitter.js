/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

import {
  BoundFunctionValue,
  ProxyValue,
  AbstractValue,
  FunctionValue,
  Value,
  ObjectValue,
  SymbolValue,
} from "../values/index.js";
import type { BabelNodeStatement } from "babel-types";
import type { SerializedBody } from "./types.js";
import { Generator } from "../utils/generator.js";
import invariant from "../invariant.js";
import { BodyReference } from "./types.js";
import { ResidualFunctions } from "./ResidualFunctions.js";

// The emitter keeps track of a stack of what's currently being emitted.
// There are two kinds of interesting dependencies the emitter is dealing with:
// 1. Value dependencies:
//    If an emission task depends on the result of another emission task which
//    is still currently being emitted, then the emission task must be performed later,
//    once the dependency is available.
//    To this end, the emitter maintains the `_activeValues` and `_waitingForValues` datastructures.
// 2. Generator dependencies:
//    For each generator, there's a corresponding "body", i.e. a stream of babel statements
//    that the emitter is appending to.
//    There's always a "current" body that is currently being emitted to.
//    There's also a distinguished `mainBody` to which all statements get directly or indirectly appended.
//    If there are multiple generators/bodies involved, then they form a stack.
//    Nested bodies are usually composed into an instruction emitted to the outer body.
//    For example, two nested generators may yield the then and else-branch of an `if` statement.
//    When an emission is supposed to target a body that is the current body, i.e. when it sits
//    lower on the stack, then the emission task gets delayed until the next emission task on
//    the lower body entry is finished.
//    To this end, the emitter maintains the `_activeBodies` and `_waitingForBodies` datastructures.
export class Emitter {
  constructor(residualFunctions: ResidualFunctions) {
    let mainBody = { type: "MainGenerator", entries: [] };
    this._waitingForValues = new Map();
    this._waitingForBodies = new Map();
    this._body = mainBody;
    this._declaredAbstractValues = new Map();
    this._residualFunctions = residualFunctions;
    this._activeStack = [];
    this._activeValues = new Set();
    this._activeBodies = [mainBody];
    this._finalized = false;
  }

  _finalized: boolean;
  _activeStack: Array<string | Generator | Value>;
  _activeValues: Set<Value>;
  _activeBodies: Array<SerializedBody>;
  _residualFunctions: ResidualFunctions;
  _waitingForValues: Map<Value, Array<{ body: SerializedBody, dependencies: Array<Value>, func: () => void }>>;
  _waitingForBodies: Map<SerializedBody, Array<{ dependencies: Array<Value>, func: () => void }>>;
  _declaredAbstractValues: Map<AbstractValue, Array<SerializedBody>>;
  _body: SerializedBody;

  beginEmitting(dependency: string | Generator | Value, targetBody: SerializedBody) {
    invariant(!this._finalized);
    this._activeStack.push(dependency);
    if (dependency instanceof Value) {
      invariant(!this._activeValues.has(dependency));
      this._activeValues.add(dependency);
    } else if (dependency instanceof Generator) {
      invariant(!this._activeBodies.includes(targetBody));
      this._activeBodies.push(targetBody);
    }
    let oldBody = this._body;
    this._body = targetBody;
    return oldBody;
  }
  emit(statement: BabelNodeStatement) {
    invariant(!this._finalized);
    this._body.entries.push(statement);
    this._processCurrentBody();
  }
  endEmitting(dependency: string | Generator | Value, oldBody: SerializedBody) {
    invariant(!this._finalized);
    let lastDependency = this._activeStack.pop();
    invariant(dependency === lastDependency);
    if (dependency instanceof Value) {
      invariant(this._activeValues.has(dependency));
      this._activeValues.delete(dependency);
      this._processValue(dependency);
    } else if (dependency instanceof Generator) {
      invariant(this._isEmittingActiveGenerator());
      this._activeBodies.pop();
    }
    let lastBody = this._body;
    this._body = oldBody;
    return lastBody;
  }
  finalize() {
    invariant(!this._finalized);
    invariant(this._activeBodies.length === 1);
    invariant(this._activeBodies[0] === this._body);
    this._processCurrentBody();
    this._activeBodies.pop();
    this._finalized = true;
    invariant(this._waitingForBodies.size === 0);
    invariant(this._waitingForValues.size === 0);
    invariant(this._activeStack.length === 0);
    invariant(this._activeValues.size === 0);
    invariant(this._activeBodies.length === 0);
  }
  /**
   * Emitter is emitting in two modes:
   * 1. Emitting to entries in current active generator
   * 2. Emitting to body of another scope(generator or residual function)
   * This function checks the first condition above.
   */
  _isEmittingActiveGenerator(): boolean {
    invariant(this._activeBodies.length > 0);
    return this._activeBodies[this._activeBodies.length - 1] === this._body;
  }
  _isGeneratorBody(body: SerializedBody): boolean {
    return body.type === "MainGenerator" || body.type === "Generator";
  }
  _processCurrentBody() {
    if (!this._isEmittingActiveGenerator()) {
      return;
    }
    let a = this._waitingForBodies.get(this._body);
    if (a === undefined) return;
    while (a.length > 0) {
      let { dependencies, func } = a.shift();
      this.emitNowOrAfterWaitingForDependencies(dependencies, func);
    }
    this._waitingForBodies.delete(this._body);
  }
  _processValue(value: Value) {
    let a = this._waitingForValues.get(value);
    if (a === undefined) return;
    let currentBody = this._body;
    while (a.length > 0) {
      let { body, dependencies, func } = a.shift();
      // If body is not generator body no need to wait for it.
      if (this._isGeneratorBody(body) && body !== currentBody) {
        this._emitAfterWaitingForGeneratorBody(body, dependencies, func);
      } else {
        this.emitNowOrAfterWaitingForDependencies(dependencies, func, body);
      }
    }
    this._waitingForValues.delete(value);
  }

  // Find the first ancestor in input generator body stack that is in current active stack.
  // It can always find one because the bottom one in the stack is the main generator.
  _getFirstAncestorGeneratorWithActiveBody(bodyStack: Array<SerializedBody>): SerializedBody {
    const activeBody = bodyStack.slice().reverse().find(body => this._activeBodies.includes(body));
    invariant(activeBody);
    return activeBody;
  }

  // Serialization of a statement related to a value MUST be delayed if
  // the creation of the value's identity requires the availability of either:
  // 1. a time-dependent value that is declared by some generator entry
  //    that has not yet been processed
  //    (tracked by `_declaredAbstractValues`), or
  // 2. a value that is also currently being serialized
  //    (tracked by `_activeValues`).
  // 3. a generator body that is higher(near top) in generator body stack.
  //    (tracked by `_activeBodies`)
  getReasonToWaitForDependencies(dependencies: Value | Array<Value>): void | Value | SerializedBody {
    invariant(!this._finalized);
    if (Array.isArray(dependencies)) {
      let values = ((dependencies: any): Array<Value>);
      for (let value of values) {
        let delayReason = this.getReasonToWaitForDependencies(value);
        if (delayReason) return delayReason;
      }
      return undefined;
    }

    let val = ((dependencies: any): Value);
    if (this._activeValues.has(val)) return val;

    let delayReason;
    if (val instanceof BoundFunctionValue) {
      delayReason = this.getReasonToWaitForDependencies(val.$BoundTargetFunction);
      if (delayReason) return delayReason;
      delayReason = this.getReasonToWaitForDependencies(val.$BoundThis);
      if (delayReason) return delayReason;
      for (let arg of val.$BoundArguments) {
        delayReason = this.getReasonToWaitForDependencies(arg);
        if (delayReason) return delayReason;
      }
    } else if (val instanceof FunctionValue) {
      this._residualFunctions.addFunctionUsage(val, this.getBodyReference());
      return undefined;
    } else if (val instanceof AbstractValue) {
      if (val.hasIdentifier()) {
        const valSerializeBodyStack = this._declaredAbstractValues.get(val);
        if (!valSerializeBodyStack) {
          // Hasn't been serialized yet.
          return val;
        } else {
          // The dependency has already been serialized(declared). But we may still have to wait for
          // current generator body to be available, under following conditions:
          // 1. Currently emitting in generator body. -- and
          // 2. Not emitting in current active generator.(otherwise no need to wait) -- and
          // 3. Dependency's active ancestor generator body is higher(near top) in generator stack than current body.
          const valActiveAncestorBody = this._getFirstAncestorGeneratorWithActiveBody(valSerializeBodyStack);
          invariant(this._activeBodies.includes(valActiveAncestorBody));

          if (this._isGeneratorBody(this._body)) {
            invariant(this._activeBodies.includes(this._body));
            if (
              !this._isEmittingActiveGenerator() &&
              this._activeBodies.indexOf(valActiveAncestorBody) > this._activeBodies.indexOf(this._body)
            ) {
              return this._body;
            }
          }
        }
      }
      for (let arg of val.args) {
        delayReason = this.getReasonToWaitForDependencies(arg);
        if (delayReason) return delayReason;
      }
    } else if (val instanceof ProxyValue) {
      delayReason = this.getReasonToWaitForDependencies(val.$ProxyTarget);
      if (delayReason) return delayReason;
      delayReason = this.getReasonToWaitForDependencies(val.$ProxyHandler);
      if (delayReason) return delayReason;
    } else if (val instanceof SymbolValue) {
      if (val.$Description instanceof Value) {
        delayReason = this.getReasonToWaitForDependencies(val.$Description);
        if (delayReason) return delayReason;
      }
    } else if (val instanceof ObjectValue) {
      let kind = val.getKind();
      switch (kind) {
        case "Object":
          let proto = val.$Prototype;
          if (proto instanceof ObjectValue) {
            delayReason = this.getReasonToWaitForDependencies(val.$Prototype);
            if (delayReason) return delayReason;
          }
          break;
        case "Date":
          invariant(val.$DateValue !== undefined);
          delayReason = this.getReasonToWaitForDependencies(val.$DateValue);
          if (delayReason) return delayReason;
          break;
        default:
          break;
      }
    }

    return undefined;
  }
  // Wait for a known-to-be active value if a condition is met.
  getReasonToWaitForActiveValue(value: Value, condition: boolean): void | Value {
    invariant(!this._finalized);
    invariant(this._activeValues.has(value));
    return condition ? value : undefined;
  }
  emitAfterWaiting(
    delayReason: void | Value | SerializedBody,
    dependencies: Array<Value>,
    func: () => void,
    targetBody: ?SerializedBody
  ) {
    if (!delayReason) {
      if (targetBody == null || targetBody === this._body) {
        // Emit into current body.
        func();
      } else {
        invariant(!this._isGeneratorBody(targetBody));
        const oldBody = this.beginEmitting(targetBody.type, targetBody);
        func();
        this.endEmitting(targetBody.type, oldBody);
      }
    } else if (delayReason instanceof Value) {
      this._emitAfterWaitingForValue(delayReason, dependencies, func);
    } else if (this._isGeneratorBody(delayReason)) {
      // delayReason is a generator body.
      this._emitAfterWaitingForGeneratorBody(delayReason, dependencies, func);
    } else {
      // Unknown delay reason.
      invariant(false);
    }
  }
  _emitAfterWaitingForValue(reason: Value, dependencies: Array<Value>, func: () => void) {
    invariant(!this._finalized);
    invariant(
      !(reason instanceof AbstractValue && this._declaredAbstractValues.has(reason)) || this._activeValues.has(reason)
    );
    let a = this._waitingForValues.get(reason);
    if (a === undefined) this._waitingForValues.set(reason, (a = []));
    a.push({ body: this._body, dependencies, func });
  }
  _emitAfterWaitingForGeneratorBody(reason: SerializedBody, dependencies: Array<Value>, func: () => void) {
    invariant(this._isGeneratorBody(reason));
    invariant(!this._finalized);
    invariant(this._activeBodies.includes(reason));
    let b = this._waitingForBodies.get(reason);
    if (b === undefined) this._waitingForBodies.set(reason, (b = []));
    b.push({ dependencies, func });
  }
  emitNowOrAfterWaitingForDependencies(dependencies: Array<Value>, func: () => void, targetBody: ?SerializedBody) {
    invariant(!this._finalized);
    this.emitAfterWaiting(this.getReasonToWaitForDependencies(dependencies), dependencies, func, targetBody);
  }
  _cloneGeneratorStack() {
    return this._activeBodies.slice();
  }
  declare(value: AbstractValue) {
    invariant(!this._finalized);
    invariant(!this._activeValues.has(value));
    invariant(value.hasIdentifier());
    invariant(this._isEmittingActiveGenerator());
    this._declaredAbstractValues.set(value, this._cloneGeneratorStack());
    this._processValue(value);
  }
  hasBeenDeclared(value: AbstractValue) {
    invariant(!this._finalized);
    return this._declaredAbstractValues.has(value);
  }
  getBody(): SerializedBody {
    return this._body;
  }
  getBodyReference() {
    invariant(!this._finalized);
    return new BodyReference(this._body, this._body.entries.length);
  }
}
