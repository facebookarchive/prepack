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
import type { BabelNodeStatement, BabelNodeIdentifier } from "babel-types";
import { Generator } from "../utils/generator.js";
import invariant from "../invariant.js";
import { BodyReference } from "./types.js";
import { ResidualFunctions } from "./ResidualFunctions.js";

// The emitter keeps track of a stack of what's currently being emitted.
// If an emission task depends on the result of another emission task which
// is still currently being emitted, then the emission task must be performed later,
// once the dependency is available.
export class Emitter {
  constructor(residualFunctions: ResidualFunctions) {
    this._waitingForEmptyStack = [];
    this._waitingForDeclaredDerivedIds = new Map();
    this._body = [];
    this._declaredDerivedIds = new Set();
    this._residualFunctions = residualFunctions;
    this._stack = [];
  }

  _stack: Array<string | Generator | Value>;
  _residualFunctions: ResidualFunctions;
  _waitingForEmptyStack: Array<{ body: Array<BabelNodeStatement>, func: () => void }>;
  _waitingForDeclaredDerivedIds: Map<
    BabelNodeIdentifier,
    Array<{ body: Array<BabelNodeStatement>, dependencies: Array<Value>, func: () => void }>
  >;
  _declaredDerivedIds: Set<BabelNodeIdentifier>;
  _body: Array<BabelNodeStatement>;

  beginEmitting(dependency: string | Generator | Value, targetBody: Array<BabelNodeStatement>) {
    this._stack.push(dependency);
    let oldBody = this._body;
    this._body = targetBody;
    return oldBody;
  }
  emit(statement: BabelNodeStatement) {
    this._body.push(statement);
  }
  endEmitting(dependency: string | Generator | Value, oldBody: Array<BabelNodeStatement>) {
    let lastDependency = this._stack.pop();
    invariant(dependency === lastDependency);
    let lastBody = this._body;
    if (this._stack.length === 0) {
      while (this._waitingForEmptyStack.length) {
        invariant(this._stack.length === 0);
        let delayed = this._waitingForEmptyStack.shift();
        this._body = delayed.body;
        delayed.func();
      }
    }
    this._body = oldBody;
    return lastBody;
  }

  // Serialization of a statement related to a value MUST be delayed if
  // the creation of the value's identity requires the availability of either:
  // 1. a time-dependent value that is declared by some generator entry
  //    that has not yet been processed
  //    (tracked by the `_declaredDerivedIds` set), or
  // 2. a value that is also currently being serialized
  //    (tracked by the `_stack`).
  getReasonToWaitForDependencies(dependencies: Value | Array<Value>): boolean | BabelNodeIdentifier {
    if (Array.isArray(dependencies)) {
      let values = ((dependencies: any): Array<Value>);
      for (let value of values) {
        let delayReason = this.getReasonToWaitForDependencies(value);
        if (delayReason) return delayReason;
      }
      return false;
    }

    let val = ((dependencies: any): Value);
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
      return false;
    } else if (val instanceof AbstractValue) {
      if (val.hasIdentifier() && !this._declaredDerivedIds.has(val.getIdentifier())) return val.getIdentifier();
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

    return this._stack.indexOf(val) >= 0;
  }
  emitAfterWaiting(reason: boolean | BabelNodeIdentifier, dependencies: Array<Value>, func: () => void) {
    invariant(reason);
    if (reason === true) {
      this._waitingForEmptyStack.push({ body: this._body, func });
    } else {
      let a = this._waitingForDeclaredDerivedIds.get(reason);
      if (a === undefined) this._waitingForDeclaredDerivedIds.set(reason, (a = []));
      a.push({ body: this._body, dependencies, func });
    }
  }
  emitNowOrAfterWaitingForDependencies(dependencies: Array<Value>, func: () => void) {
    let delayReason = this.getReasonToWaitForDependencies(dependencies);
    if (delayReason) {
      this.emitAfterWaiting(delayReason, dependencies, func);
    } else {
      func();
    }
  }
  announceDeclaredDerivedId(id: BabelNodeIdentifier) {
    this._declaredDerivedIds.add(id);
    let a = this._waitingForDeclaredDerivedIds.get(id);
    if (a !== undefined) {
      let oldBody = this._body;
      while (a.length > 0) {
        invariant(this._stack.length === 0);
        invariant(this._waitingForEmptyStack.length === 0);
        let { body, dependencies, func } = a.shift();
        this._body = body;
        this.emitNowOrAfterWaitingForDependencies(dependencies, func);
      }
      this._body = oldBody;
      this._waitingForDeclaredDerivedIds.delete(id);
    }
  }
  hasDeclaredDerivedIdBeenAnnounced(id: BabelNodeIdentifier) {
    return this._declaredDerivedIds.has(id);
  }

  assertIsDrained() {
    invariant(this._waitingForDeclaredDerivedIds.size === 0);
  }

  getBody(): Array<BabelNodeStatement> {
    return this._body;
  }
  getBodyReference() {
    return new BodyReference(this._body, this._body.length);
  }
}
