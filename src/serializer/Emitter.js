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
    let mainBody = [];
    this._waitingForValues = new Map();
    this._waitingForBodies = new Map();
    this._body = mainBody;
    this._declaredAbstractValues = new Set();
    this._residualFunctions = residualFunctions;
    this._activeStack = [];
    this._activeValues = new Set();
    this._activeBodies = new Set([mainBody]);
    this._finalized = false;
  }

  _finalized: boolean;
  _activeStack: Array<string | Generator | Value>;
  _activeValues: Set<Value>;
  _activeBodies: Set<Array<BabelNodeStatement>>;
  _residualFunctions: ResidualFunctions;
  _waitingForValues: Map<
    Value,
    Array<{ body: Array<BabelNodeStatement>, dependencies: Array<Value>, func: () => void }>
  >;
  _waitingForBodies: Map<Array<BabelNodeStatement>, Array<{ dependencies: Array<Value>, func: () => void }>>;
  _declaredAbstractValues: Set<AbstractValue>;
  _body: Array<BabelNodeStatement>;

  beginEmitting(dependency: string | Generator | Value, targetBody: Array<BabelNodeStatement>) {
    invariant(!this._finalized);
    this._activeStack.push(dependency);
    if (dependency instanceof Value) this._activeValues.add(dependency);
    else if (dependency instanceof Generator) this._activeBodies.add(targetBody);
    let oldBody = this._body;
    this._body = targetBody;
    return oldBody;
  }
  emit(statement: BabelNodeStatement) {
    invariant(!this._finalized);
    this._body.push(statement);
    this._processCurrentBody();
  }
  endEmitting(dependency: string | Generator | Value, oldBody: Array<BabelNodeStatement>) {
    invariant(!this._finalized);
    let lastDependency = this._activeStack.pop();
    invariant(dependency === lastDependency);
    if (dependency instanceof Value) {
      invariant(this._activeValues.has(dependency));
      this._activeValues.delete(dependency);
      this._processValue(dependency);
    } else if (dependency instanceof Generator) {
      invariant(this._activeBodies.has(this._body));
      this._activeBodies.delete(this._body);
    }
    let lastBody = this._body;
    this._body = oldBody;
    return lastBody;
  }
  finalize() {
    invariant(!this._finalized);
    invariant(this._activeBodies.size === 1);
    invariant(this._activeBodies.has(this._body));
    this._activeBodies.delete(this._body);
    this._processCurrentBody();
    this._finalized = true;
    invariant(this._waitingForBodies.size === 0);
    invariant(this._waitingForValues.size === 0);
    invariant(this._activeStack.length === 0);
    invariant(this._activeValues.size === 0);
    invariant(this._activeBodies.size === 0);
  }
  _processCurrentBody() {
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
    let oldBody = this._body;
    while (a.length > 0) {
      let { body, dependencies, func } = a.shift();
      if (body !== oldBody) {
        invariant(this._activeBodies.has(body));
        let b = this._waitingForBodies.get(body);
        if (b === undefined) this._waitingForBodies.set(body, (b = []));
        b.push({ dependencies, func });
      } else {
        this.emitNowOrAfterWaitingForDependencies(dependencies, func);
      }
    }
    this._waitingForValues.delete(value);
  }

  // Serialization of a statement related to a value MUST be delayed if
  // the creation of the value's identity requires the availability of either:
  // 1. a time-dependent value that is declared by some generator entry
  //    that has not yet been processed
  //    (tracked by the `_declaredAbstractValues` set), or
  // 2. a value that is also currently being serialized
  //    (tracked by the `_activeStack`).
  getReasonToWaitForDependencies(dependencies: Value | Array<Value>): void | Value {
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
      if (val.hasIdentifier() && !this._declaredAbstractValues.has(val)) return val;
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
  emitAfterWaiting(reason: Value, dependencies: Array<Value>, func: () => void) {
    invariant(!this._finalized);
    invariant(
      !(reason instanceof AbstractValue && this._declaredAbstractValues.has(reason)) || this._activeValues.has(reason)
    );
    let a = this._waitingForValues.get(reason);
    if (a === undefined) this._waitingForValues.set(reason, (a = []));
    a.push({ body: this._body, dependencies, func });
  }
  emitNowOrAfterWaitingForDependencies(dependencies: Array<Value>, func: () => void) {
    invariant(!this._finalized);
    let delayReason = this.getReasonToWaitForDependencies(dependencies);
    if (delayReason) {
      this.emitAfterWaiting(delayReason, dependencies, func);
    } else {
      func();
    }
  }
  declare(value: AbstractValue) {
    invariant(!this._finalized);
    invariant(!this._activeValues.has(value));
    invariant(value.hasIdentifier());
    this._declaredAbstractValues.add(value);
    this._processValue(value);
  }
  hasBeenDeclared(value: AbstractValue) {
    invariant(!this._finalized);
    return this._declaredAbstractValues.has(value);
  }
  getBody(): Array<BabelNodeStatement> {
    return this._body;
  }
  getBodyReference() {
    invariant(!this._finalized);
    return new BodyReference(this._body, this._body.length);
  }
}
