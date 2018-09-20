/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

import type { BabelNodeSourceLocation } from "@babel/types";
import invariant from "./invariant.js";
import type { Effects } from "./realm.js";
import { PathConditions } from "./types.js";
import { AbstractValue, EmptyValue, Value } from "./values/index.js";

export class Completion {
  constructor(value: Value, location: ?BabelNodeSourceLocation, target?: ?string) {
    this.value = value;
    this.target = target;
    this.location = location;
    invariant(this.constructor !== Completion, "Completion is an abstract base class");
  }

  value: Value;
  target: ?string;
  location: ?BabelNodeSourceLocation;

  containsSelectedCompletion(selector: Completion => boolean): boolean {
    return selector(this);
  }

  shallowClone(): Completion {
    invariant(false, "abstract base method");
  }

  toDisplayString(): string {
    return "[" + this.constructor.name + " value " + (this.value ? this.value.toDisplayString() : "undefined") + "]";
  }

  static makeAllNormalCompletionsResultInUndefined(completion: Completion): void {
    let undefinedVal = completion.value.$Realm.intrinsics.undefined;
    if (completion instanceof SimpleNormalCompletion) completion.value = undefinedVal;
    else if (completion instanceof JoinedNormalAndAbruptCompletions) {
      if (completion.composedWith !== undefined)
        Completion.makeAllNormalCompletionsResultInUndefined(completion.composedWith);
      Completion.makeAllNormalCompletionsResultInUndefined(completion.consequent);
      Completion.makeAllNormalCompletionsResultInUndefined(completion.alternate);
    }
  }

  static makeSelectedCompletionsInfeasible(selector: Completion => boolean, completion: Completion): void {
    let bottomValue = completion.value.$Realm.intrinsics.__bottomValue;
    if (selector(completion)) completion.value = bottomValue;
    else if (completion instanceof JoinedNormalAndAbruptCompletions || completion instanceof JoinedAbruptCompletions) {
      if (completion instanceof JoinedNormalAndAbruptCompletions && completion.composedWith !== undefined)
        Completion.makeSelectedCompletionsInfeasible(selector, completion.composedWith);
      Completion.makeSelectedCompletionsInfeasible(selector, completion.consequent);
      Completion.makeSelectedCompletionsInfeasible(selector, completion.alternate);
    }
  }

  static makeSelectedCompletionsInfeasibleInCopy(selector: Completion => boolean, completion: Completion): Completion {
    let bottomValue = completion.value.$Realm.intrinsics.__bottomValue;
    let clone = completion.shallowClone();
    if (selector(clone)) clone.value = bottomValue;
    else if (clone instanceof JoinedNormalAndAbruptCompletions || clone instanceof JoinedAbruptCompletions) {
      clone.consequent = (Completion.makeSelectedCompletionsInfeasibleInCopy(selector, clone.consequent): any);
      clone.alternate = (Completion.makeSelectedCompletionsInfeasibleInCopy(selector, clone.alternate): any);
      if (clone.consequent.value === bottomValue) {
        return clone.alternate;
      }
      if (clone.alternate.value === bottomValue) {
        return clone.consequent;
      }
    }
    return clone;
  }

  static normalizeSelectedCompletions(selector: Completion => boolean, completion: Completion): Completion {
    if (selector(completion)) return new SimpleNormalCompletion(completion.value);
    let normalizedComposedWith;
    if (completion instanceof JoinedNormalAndAbruptCompletions) {
      invariant(completion.savedEffects === undefined); // caller should not used a still saved completion for this
      if (completion.composedWith !== undefined)
        normalizedComposedWith = Completion.normalizeSelectedCompletions(selector, completion.composedWith);
    }
    if (completion instanceof JoinedNormalAndAbruptCompletions || completion instanceof JoinedAbruptCompletions) {
      let nc = Completion.normalizeSelectedCompletions(selector, completion.consequent);
      let na = Completion.normalizeSelectedCompletions(selector, completion.alternate);
      if (normalizedComposedWith === undefined) {
        if (nc === completion.consequent && na === completion.alternate) return completion;
        if (nc instanceof AbruptCompletion && na instanceof AbruptCompletion) return completion;
        if (nc instanceof SimpleNormalCompletion && na instanceof SimpleNormalCompletion)
          return new SimpleNormalCompletion(
            AbstractValue.createFromConditionalOp(completion.value.$Realm, completion.joinCondition, nc.value, na.value)
          );
        invariant(nc instanceof AbruptCompletion || nc instanceof NormalCompletion);
        invariant(na instanceof AbruptCompletion || na instanceof NormalCompletion);
        return new JoinedNormalAndAbruptCompletions(completion.joinCondition, nc, na);
      }
      invariant(nc instanceof AbruptCompletion || nc instanceof NormalCompletion);
      invariant(na instanceof AbruptCompletion || na instanceof NormalCompletion);
      let result = new JoinedNormalAndAbruptCompletions(completion.joinCondition, nc, na);
      if (normalizedComposedWith instanceof JoinedNormalAndAbruptCompletions)
        result.composedWith = normalizedComposedWith;
      return result;
    }
    return completion;
  }
}

// Normal completions are returned just like spec completions
export class NormalCompletion extends Completion {
  constructor(value: Value, location: ?BabelNodeSourceLocation, target?: ?string) {
    super(value, location, target);
    invariant(this.constructor !== NormalCompletion, "NormalCompletion is an abstract base class");
  }
}

// SimpleNormalCompletions are returned just like spec completions.
// They chiefly exist for use in joined completions.
export class SimpleNormalCompletion extends NormalCompletion {
  shallowClone(): SimpleNormalCompletion {
    return new SimpleNormalCompletion(this.value, this.location, this.target);
  }
}

// Abrupt completions are thrown as exeptions, to make it a easier
// to quickly get to the matching high level construct.
export class AbruptCompletion extends Completion {
  constructor(value: Value, location: ?BabelNodeSourceLocation, target?: ?string) {
    super(value, location, target);
    invariant(this.constructor !== AbruptCompletion, "AbruptCompletion is an abstract base class");
  }
}

export class ThrowCompletion extends AbruptCompletion {
  constructor(value: Value, location: ?BabelNodeSourceLocation, nativeStack?: ?string, emitWarning?: boolean = true) {
    super(value, location);
    this.nativeStack = nativeStack || new Error().stack;
  }

  nativeStack: string;

  shallowClone(): ThrowCompletion {
    return new ThrowCompletion(this.value, this.location, this.nativeStack, false);
  }
}

export class ContinueCompletion extends AbruptCompletion {
  constructor(value: Value, location: ?BabelNodeSourceLocation, target: ?string) {
    super(value, location, target || null);
  }

  shallowClone(): ContinueCompletion {
    return new ContinueCompletion(this.value, this.location, this.target);
  }
}

export class BreakCompletion extends AbruptCompletion {
  constructor(value: Value, location: ?BabelNodeSourceLocation, target: ?string) {
    super(value, location, target || null);
  }

  shallowClone(): BreakCompletion {
    return new BreakCompletion(this.value, this.location, this.target);
  }
}

export class ReturnCompletion extends AbruptCompletion {
  constructor(value: Value, location: ?BabelNodeSourceLocation) {
    super(value, location);
    if (value instanceof EmptyValue) {
      this.value = value.$Realm.intrinsics.undefined;
    }
  }

  shallowClone(): ReturnCompletion {
    return new ReturnCompletion(this.value, this.location);
  }
}

export class JoinedAbruptCompletions extends AbruptCompletion {
  constructor(joinCondition: AbstractValue, consequent: AbruptCompletion, alternate: AbruptCompletion) {
    super(joinCondition.$Realm.intrinsics.empty, consequent.location);
    this.joinCondition = joinCondition;
    this.consequent = consequent;
    this.alternate = alternate;
  }

  joinCondition: AbstractValue;
  consequent: AbruptCompletion;
  alternate: AbruptCompletion;

  containsSelectedCompletion(selector: Completion => boolean): boolean {
    if (selector(this.consequent)) return true;
    if (selector(this.alternate)) return true;
    if (this.consequent instanceof JoinedAbruptCompletions) {
      if (this.consequent.containsSelectedCompletion(selector)) return true;
    }
    if (this.alternate instanceof JoinedAbruptCompletions) {
      if (this.alternate.containsSelectedCompletion(selector)) return true;
    }
    return false;
  }

  shallowClone(): JoinedAbruptCompletions {
    return new JoinedAbruptCompletions(this.joinCondition, this.consequent, this.alternate);
  }

  toDisplayString(): string {
    let superString = super.toDisplayString().slice(0, -1);
    return (
      superString + " c: [" + this.consequent.toDisplayString() + "] a: [" + this.alternate.toDisplayString() + "]]"
    );
  }
}

// This should never be thrown, therefore it is treated as a NormalCompletion even though it is also Abrupt.
export class JoinedNormalAndAbruptCompletions extends NormalCompletion {
  constructor(
    joinCondition: AbstractValue,
    consequent: AbruptCompletion | NormalCompletion,
    alternate: AbruptCompletion | NormalCompletion
  ) {
    super(consequent instanceof NormalCompletion ? consequent.value : alternate.value, consequent.location);
    this.joinCondition = joinCondition;
    this.consequent = consequent;
    this.alternate = alternate;
    this.pathConditionsAtCreation = joinCondition.$Realm.pathConditions;
  }

  joinCondition: AbstractValue;
  consequent: AbruptCompletion | NormalCompletion;
  alternate: AbruptCompletion | NormalCompletion;
  // A completion that precedes this one and that has one or more normal paths, as well as some abrupt paths
  composedWith: void | JoinedNormalAndAbruptCompletions;
  pathConditionsAtCreation: PathConditions;
  savedEffects: void | Effects;

  containsSelectedCompletion(selector: Completion => boolean): boolean {
    if (this.composedWith !== undefined && this.composedWith.containsSelectedCompletion(selector)) return true;
    if (selector(this.consequent)) return true;
    if (selector(this.alternate)) return true;
    if (
      this.consequent instanceof JoinedAbruptCompletions ||
      this.consequent instanceof JoinedNormalAndAbruptCompletions
    ) {
      if (this.consequent.containsSelectedCompletion(selector)) return true;
    }
    if (
      this.alternate instanceof JoinedAbruptCompletions ||
      this.alternate instanceof JoinedNormalAndAbruptCompletions
    ) {
      if (this.alternate.containsSelectedCompletion(selector)) return true;
    }
    return false;
  }

  shallowClone(): JoinedNormalAndAbruptCompletions {
    let clone = new JoinedNormalAndAbruptCompletions(this.joinCondition, this.consequent, this.alternate);
    clone.composedWith = this.composedWith;
    clone.pathConditionsAtCreation = this.pathConditionsAtCreation;
    return clone;
  }

  toDisplayString(): string {
    let superString = super.toDisplayString().slice(0, -1);
    return (
      superString + " c: [" + this.consequent.toDisplayString() + "] a: [" + this.alternate.toDisplayString() + "]]"
    );
  }
}
