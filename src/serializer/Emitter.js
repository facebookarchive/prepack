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

// Type used to configure callbacks from the dependenciesVisitor of the Emitter.
type EmitterDependenciesVisitorCallbacks<T> = {
  // Callback invoked whenever an "active" dependency is visited, i.e. a dependency which is in the process of being emitted.
  // A return value that is not undefined indicates that the visitor should stop, and return the value as the overall result.
  onActive?: Value => void | T,
  // Callback invoked whenever a dependency is visited that is a FunctionValue.
  // A return value that is not undefined indicates that the visitor should stop, and return the value as the overall result.
  onFunction?: FunctionValue => void | T,
  // Callback invoked whenever a dependency is visited that is an abstract value with an identifier.
  // A return value that is not undefined indicates that the visitor should stop, and return the value as the overall result.
  onAbstractValueWithIdentifier?: AbstractValue => void | T,
};

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
//    To this end, the emitter maintains the `_activeGeneratorStack` and `_waitingForBodies` datastructures.
export class Emitter {
  constructor(residualFunctions: ResidualFunctions) {
    this._mainBody = { type: "MainGenerator", parentBody: undefined, entries: [], done: false };
    this._waitingForValues = new Map();
    this._waitingForBodies = new Map();
    this._body = this._mainBody;
    this._residualFunctions = residualFunctions;
    this._activeStack = [];
    this._activeValues = new Set();
    this._activeGeneratorStack = [this._mainBody];
    this._finalized = false;
    this._getReasonToWaitForDependenciesCallbacks = {
      onActive: val => val, // cyclic dependency; we need to wait until this value has finished emitting
      onFunction: val => {
        // Functions are currently handled in a special way --- they are all defined ahead of time. Thus, we never have to wait for functions.
        this._residualFunctions.addFunctionUsage(val, this.getBodyReference());
        return undefined;
      },
      onAbstractValueWithIdentifier: val => {
        // If the value hasn't been declared yet, then we should wait for it.
        if (!this.ignoreDeclarations() && !this.hasBeenDeclared(val)) return val;
        else return undefined;
      },
    };
  }

  _finalized: boolean;
  _activeStack: Array<string | Generator | Value>;
  _activeValues: Set<Value>;
  _activeGeneratorStack: Array<SerializedBody>; // Contains all the active generator bodies in stack order.
  _residualFunctions: ResidualFunctions;
  _waitingForValues: Map<Value, Array<{ body: SerializedBody, dependencies: Array<Value>, func: () => void }>>;
  _waitingForBodies: Map<SerializedBody, Array<{ dependencies: Array<Value>, func: () => void }>>;
  _body: SerializedBody;
  _mainBody: SerializedBody;
  _getReasonToWaitForDependenciesCallbacks: EmitterDependenciesVisitorCallbacks<Value>;

  // Begin to emit something. Such sessions can be nested.
  // The dependency indicates what is being emitted; until this emission ends, other parties might have to wait for the dependency.
  // The targetBody is a wrapper that holds the sequence of statements that are going to be emitted.
  // If isChild, then we are starting a new emitting session as a branch off the previously active emitting session.
  beginEmitting(dependency: string | Generator | Value, targetBody: SerializedBody, isChild: boolean = false) {
    invariant(!this._finalized);
    this._activeStack.push(dependency);
    if (dependency instanceof Value) {
      invariant(!this._activeValues.has(dependency));
      this._activeValues.add(dependency);
    } else if (dependency instanceof Generator) {
      invariant(!this._activeGeneratorStack.includes(targetBody));
      this._activeGeneratorStack.push(targetBody);
    }
    if (isChild) {
      invariant(targetBody.type === "Generator" || targetBody.type === "ConditionalAssignmentBranch");
      targetBody.parentBody = this._body;
      targetBody.nestingLevel = (this._body.nestingLevel || 0) + 1;
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
  // End to emit something. The parameters dependency and isChild must match a previous call to beginEmitting.
  // oldBody should be the value returned by the previous matching beginEmitting call.
  endEmitting(dependency: string | Generator | Value, oldBody: SerializedBody, isChild: boolean = false) {
    invariant(!this._finalized);
    let lastDependency = this._activeStack.pop();
    invariant(dependency === lastDependency);
    if (dependency instanceof Value) {
      invariant(this._activeValues.has(dependency));
      this._activeValues.delete(dependency);
      this._processValue(dependency);
    } else if (dependency instanceof Generator) {
      invariant(this._isEmittingActiveGenerator());
      this._activeGeneratorStack.pop();
    }
    let lastBody = this._body;
    this._body = oldBody;
    if (isChild) {
      invariant(lastBody.parentBody === oldBody);
      invariant(lastBody.nestingLevel > 0);
      invariant(!lastBody.done);
      lastBody.done = true;
      // When we are done processing a body, we can propogate all declared abstract values
      // to its parent, possibly unlocking further processing...
      if (lastBody.declaredAbstractValues) {
        let anyPropagated = true;
        for (let b = lastBody; b.done && b.parentBody !== undefined && anyPropagated; b = b.parentBody) {
          anyPropagated = false;
          let parentDeclaredAbstractValues = b.parentBody.declaredAbstractValues;
          if (parentDeclaredAbstractValues === undefined)
            b.parentBody.declaredAbstractValues = parentDeclaredAbstractValues = new Map();
          invariant(b.declaredAbstractValues);
          for (let [key, value] of b.declaredAbstractValues) {
            if (!parentDeclaredAbstractValues.has(key)) {
              parentDeclaredAbstractValues.set(key, value);
              this._processValue(key);
              anyPropagated = true;
            }
          }
        }
      }
    }

    return lastBody;
  }
  finalize() {
    invariant(!this._finalized);
    invariant(this._activeGeneratorStack.length === 1);
    invariant(this._activeGeneratorStack[0] === this._body);
    invariant(this._body === this._mainBody);
    this._processCurrentBody();
    this._activeGeneratorStack.pop();
    this._finalized = true;
    invariant(this._waitingForBodies.size === 0);
    invariant(this._waitingForValues.size === 0);
    invariant(this._activeStack.length === 0);
    invariant(this._activeValues.size === 0);
    invariant(this._activeGeneratorStack.length === 0);
  }
  /**
   * Emitter is emitting in two modes:
   * 1. Emitting to entries in current active generator
   * 2. Emitting to body of another scope(generator or residual function)
   * This function checks the first condition above.
   */
  _isEmittingActiveGenerator(): boolean {
    invariant(this._activeGeneratorStack.length > 0);
    return this._activeGeneratorStack[this._activeGeneratorStack.length - 1] === this._body;
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
    const activeBody = bodyStack.slice().reverse().find(body => this._activeGeneratorStack.includes(body));
    invariant(activeBody);
    return activeBody;
  }

  // Serialization of a statement related to a value MUST be delayed if
  // the creation of the value's identity requires the availability of either:
  // 1. a value that is also currently being serialized
  //    (tracked by `_activeValues`).
  // 2. a time-dependent value that is declared by some generator entry
  //    that has not yet been processed
  //    (tracked by `declaredAbstractValues` in bodies)
  getReasonToWaitForDependencies(dependencies: Value | Array<Value>): void | Value {
    return this.dependenciesVisitor(dependencies, this._getReasonToWaitForDependenciesCallbacks);
  }

  // Visitor of dependencies that require delaying serialization
  dependenciesVisitor<T>(
    dependencies: Value | Array<Value>,
    callbacks: EmitterDependenciesVisitorCallbacks<T>
  ): void | T {
    invariant(!this._finalized);

    let result;
    let recurse = value => this.dependenciesVisitor(value, callbacks);

    if (Array.isArray(dependencies)) {
      let values = ((dependencies: any): Array<Value>);
      for (let value of values) {
        result = recurse(value);
        if (result !== undefined) return result;
      }
      return undefined;
    }

    let val = ((dependencies: any): Value);
    if (this._activeValues.has(val)) {
      // We ran into a cyclic dependency, where the value we are dependending on is still in the process of being emitted.
      result = callbacks.onActive ? callbacks.onActive(val) : undefined;
      if (result !== undefined) return result;
    }

    if (val instanceof BoundFunctionValue) {
      result = recurse(val.$BoundTargetFunction);
      if (result !== undefined) return result;
      result = recurse(val.$BoundThis);
      if (result !== undefined) return result;
      result = recurse(val.$BoundArguments);
      if (result !== undefined) return result;
    } else if (val instanceof FunctionValue) {
      // We ran into a function value.
      result = callbacks.onFunction ? callbacks.onFunction(val) : undefined;
      if (result !== undefined) return result;
    } else if (val instanceof AbstractValue) {
      if (val.hasIdentifier()) {
        // We ran into an abstract value that might have to be declared.
        result = callbacks.onAbstractValueWithIdentifier ? callbacks.onAbstractValueWithIdentifier(val) : undefined;
        if (result !== undefined) return result;
      }
      result = recurse(val.args);
      if (result !== undefined) return result;
    } else if (val instanceof ProxyValue) {
      result = recurse(val.$ProxyTarget);
      if (result !== undefined) return result;
      result = recurse(val.$ProxyHandler);
      if (result !== undefined) return result;
    } else if (val instanceof SymbolValue) {
      if (val.$Description instanceof Value) {
        result = recurse(val.$Description);
        if (result !== undefined) return result;
      }
    } else if (val instanceof ObjectValue) {
      let kind = val.getKind();
      switch (kind) {
        case "Object":
          let proto = val.$Prototype;
          if (proto instanceof ObjectValue) {
            result = recurse(val.$Prototype);
            if (result !== undefined) return result;
          }
          break;
        case "Date":
          invariant(val.$DateValue !== undefined);
          result = recurse(val.$DateValue);
          if (result !== undefined) return result;
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
  _shouldEmitWithoutWaiting(delayReason: void | Value | SerializedBody, targetBody?: SerializedBody): boolean {
    /**
     * We can directly emit without waiting if:
     * 1. No delayReason
     * 2. delayReason is a generator body while the target body we are not emitting into is not a generator body.
     */
    return (
      !delayReason ||
      (!(delayReason instanceof Value) &&
        this._isGeneratorBody(delayReason) &&
        targetBody !== undefined &&
        !this._isGeneratorBody(targetBody))
    );
  }
  emitAfterWaiting(
    delayReason: void | Value | SerializedBody,
    dependencies: Array<Value>,
    func: () => void,
    targetBody?: SerializedBody
  ) {
    if (this._shouldEmitWithoutWaiting(delayReason, targetBody)) {
      if (targetBody === undefined || targetBody === this._body) {
        // Emit into current body.
        func();
      } else {
        invariant(!this._isGeneratorBody(targetBody));
        const oldBody = this.beginEmitting(targetBody.type, targetBody);
        func();
        this.endEmitting(targetBody.type, oldBody);
      }
    } else {
      invariant(delayReason !== undefined);
      if (delayReason instanceof Value) {
        this._emitAfterWaitingForValue(
          delayReason,
          dependencies,
          targetBody === undefined ? this._body : targetBody,
          func
        );
      } else if (this._isGeneratorBody(delayReason)) {
        // delayReason is a generator body.
        this._emitAfterWaitingForGeneratorBody(delayReason, dependencies, func);
      } else {
        // Unknown delay reason.
        invariant(false);
      }
    }
  }
  _emitAfterWaitingForValue(reason: Value, dependencies: Array<Value>, targetBody: SerializedBody, func: () => void) {
    invariant(!this._finalized);
    invariant(!(reason instanceof AbstractValue && this.hasBeenDeclared(reason)) || this._activeValues.has(reason));
    let a = this._waitingForValues.get(reason);
    if (a === undefined) this._waitingForValues.set(reason, (a = []));
    a.push({ body: targetBody, dependencies, func });
  }
  _emitAfterWaitingForGeneratorBody(reason: SerializedBody, dependencies: Array<Value>, func: () => void) {
    invariant(this._isGeneratorBody(reason));
    invariant(!this._finalized);
    invariant(this._activeGeneratorStack.includes(reason));
    let b = this._waitingForBodies.get(reason);
    if (b === undefined) this._waitingForBodies.set(reason, (b = []));
    b.push({ dependencies, func });
  }
  emitNowOrAfterWaitingForDependencies(dependencies: Array<Value>, func: () => void, targetBody?: SerializedBody) {
    invariant(!this._finalized);
    this.emitAfterWaiting(this.getReasonToWaitForDependencies(dependencies), dependencies, func, targetBody);
  }
  declare(value: AbstractValue) {
    invariant(!this._finalized);
    invariant(!this._activeValues.has(value));
    invariant(value.hasIdentifier());
    invariant(this._isEmittingActiveGenerator());
    invariant(!this.ignoreDeclarations());
    invariant(!this._body.done);
    if (this._body.declaredAbstractValues === undefined) this._body.declaredAbstractValues = new Map();
    this._body.declaredAbstractValues.set(value, this._body);
    this._processValue(value);
  }
  ignoreDeclarations(): boolean {
    // Bodies of the following types will never contain any (temporal) abstract value declarations.
    return this._body.type === "DelayInitializations" || this._body.type === "LazyObjectInitializer";
  }
  hasBeenDeclared(value: AbstractValue): boolean {
    return this.getDeclarationBody(value) !== undefined;
  }
  getDeclarationBody(value: AbstractValue): void | SerializedBody {
    for (let b = this._body; b !== undefined; b = b.parentBody)
      if (b.declaredAbstractValues !== undefined && b.declaredAbstractValues.has(value)) {
        return b;
      }
    return undefined;
  }
  declaredCount() {
    let declaredAbstractValues = this._body.declaredAbstractValues;
    return declaredAbstractValues === undefined ? 0 : declaredAbstractValues.size;
  }
  getBody(): SerializedBody {
    return this._body;
  }
  isCurrentBodyOffspringOf(targetBody: SerializedBody): boolean {
    let currentBody = this._body;
    while (currentBody !== undefined) {
      if (currentBody === targetBody) {
        return true;
      }
      currentBody = currentBody.parentBody;
    }
    return false;
  }
  getBodyReference() {
    invariant(!this._finalized);
    return new BodyReference(this._body, this._body.entries.length);
  }
}
