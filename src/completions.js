/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

import type { BabelNodeSourceLocation } from "babel-types";
import invariant from "./invariant.js";
import type { Effects, Realm } from "./realm.js";
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

  effects: ?Effects;

  toDisplayString(): string {
    return "[" + this.constructor.name + " value " + (this.value ? this.value.toDisplayString() : "undefined") + "]";
  }
}

// Normal completions are returned just like spec completions
export class NormalCompletion extends Completion {
  constructor(value: Value, location: ?BabelNodeSourceLocation, target?: ?string) {
    super(value, location, target);
    invariant(this.constructor !== NormalCompletion, "NormalCompletion is an abstract base class");
  }
}

// SimpleNormalCompletions are returned just like spec completions. This class exists as the parallel for
// PossiblyNormalCompletion to make comparisons easier.
export class SimpleNormalCompletion extends NormalCompletion {}

// Abrupt completions are thrown as exeptions, to make it a easier
// to quickly get to the matching high level construct.
export class AbruptCompletion extends Completion {
  constructor(value: Value, location: ?BabelNodeSourceLocation, target?: ?string) {
    super(value, location, target);
    invariant(this.constructor !== AbruptCompletion, "AbruptCompletion is an abstract base class");
  }
}

export class ThrowCompletion extends AbruptCompletion {
  constructor(value: Value, location: ?BabelNodeSourceLocation, nativeStack?: ?string) {
    super(value, location);
    this.nativeStack = nativeStack || new Error().stack;
    let realm = value.$Realm;
    if (realm.isInPureScope() && realm.reportSideEffectCallback !== undefined) {
      realm.reportSideEffectCallback("EXCEPTION_THROWN", undefined, location);
    }
  }

  nativeStack: string;
}

export class ContinueCompletion extends AbruptCompletion {
  constructor(value: Value, location: ?BabelNodeSourceLocation, target: ?string) {
    super(value, location, target || null);
  }
}

export class BreakCompletion extends AbruptCompletion {
  constructor(value: Value, location: ?BabelNodeSourceLocation, target: ?string) {
    super(value, location, target || null);
  }
}

export class ReturnCompletion extends AbruptCompletion {
  constructor(value: Value, location: ?BabelNodeSourceLocation) {
    super(value, location);
  }
}

// An erased abrupt completion arises when an abrupt completion reaches a join point.
// Ideally we should use a SimpleNormalCompletion in its place, but that can only
// happen after ForkedAbruptCompletion and PossiblyNormalCompletion are unified.
export class ErasedAbruptCompletion extends AbruptCompletion {}

export class ForkedAbruptCompletion extends AbruptCompletion {
  constructor(
    realm: Realm,
    joinCondition: AbstractValue,
    consequent: AbruptCompletion,
    consequentEffects: Effects,
    alternate: AbruptCompletion,
    alternateEffects: Effects
  ) {
    super(realm.intrinsics.empty, consequent.location);
    invariant(consequentEffects);
    invariant(alternateEffects);
    this.joinCondition = joinCondition;
    consequent.effects = consequentEffects;
    this.consequent = consequent;
    alternate.effects = alternateEffects;
    this.alternate = alternate;
  }

  joinCondition: AbstractValue;
  consequent: AbruptCompletion;
  alternate: AbruptCompletion;

  // For convenience, this.consequent.effects should always be defined, but accessing it directly requires
  // verifying that with an invariant.
  get consequentEffects(): Effects {
    invariant(this.consequent.effects);
    return this.consequent.effects;
  }

  get alternateEffects(): Effects {
    invariant(this.alternate.effects);
    return this.alternate.effects;
  }

  updateConsequentKeepingCurrentEffects(newConsequent: AbruptCompletion): AbruptCompletion {
    let effects = this.consequent.effects;
    invariant(effects);
    newConsequent.effects = effects;
    newConsequent.effects.result = newConsequent;
    this.consequent = newConsequent;
    return newConsequent;
  }

  updateAlternateKeepingCurrentEffects(newAlternate: AbruptCompletion): AbruptCompletion {
    let effects = this.alternate.effects;
    invariant(effects);
    newAlternate.effects = effects;
    newAlternate.effects.result = newAlternate;
    this.alternate = newAlternate;
    return newAlternate;
  }

  toDisplayString(): string {
    let superString = super.toDisplayString().slice(0, -1);
    return (
      superString + " c: [" + this.consequent.toDisplayString() + "] a: [" + this.alternate.toDisplayString() + "]]"
    );
  }

  containsCompletion(CompletionType: typeof Completion): boolean {
    if (this.consequent instanceof CompletionType) return true;
    if (this.alternate instanceof CompletionType) return true;
    if (this.consequent instanceof ForkedAbruptCompletion) {
      if (this.consequent.containsCompletion(CompletionType)) return true;
    }
    if (this.alternate instanceof ForkedAbruptCompletion) {
      if (this.alternate.containsCompletion(CompletionType)) return true;
    }
    return false;
  }

  containsBreakOrContinue(): boolean {
    if (this.consequent instanceof BreakCompletion || this.consequent instanceof ContinueCompletion) return true;
    if (this.alternate instanceof BreakCompletion || this.alternate instanceof ContinueCompletion) return true;
    if (this.consequent instanceof ForkedAbruptCompletion) {
      if (this.consequent.containsBreakOrContinue()) return true;
    }
    if (this.alternate instanceof ForkedAbruptCompletion) {
      if (this.alternate.containsBreakOrContinue()) return true;
    }
    return false;
  }

  transferChildrenToPossiblyNormalCompletion(): PossiblyNormalCompletion {
    invariant(this.consequent.value instanceof EmptyValue || this.alternate.value instanceof EmptyValue);
    return new PossiblyNormalCompletion(
      this.value.$Realm.intrinsics.empty,
      this.joinCondition,
      this.consequent,
      this.consequentEffects,
      this.alternate,
      this.alternateEffects,
      []
    );
  }
}

// Possibly normal completions have to be treated like normal completions
// and are thus never thrown. At the end of a try block or loop body, however,
// action must be taken to deal with the possibly abrupt case of the completion.
export class PossiblyNormalCompletion extends NormalCompletion {
  constructor(
    value: Value,
    joinCondition: AbstractValue,
    consequent: Completion,
    consequentEffects: Effects,
    alternate: Completion,
    alternateEffects: Effects,
    savedPathConditions: Array<AbstractValue>,
    savedEffects: void | Effects = undefined
  ) {
    invariant(consequent === consequentEffects.result);
    invariant(alternate === alternateEffects.result);
    invariant(consequent instanceof NormalCompletion || alternate instanceof NormalCompletion);
    invariant(consequent instanceof AbruptCompletion || alternate instanceof AbruptCompletion);
    invariant(
      consequent instanceof AbruptCompletion || (consequent instanceof NormalCompletion && value === consequent.value)
    );
    invariant(
      alternate instanceof AbruptCompletion || (alternate instanceof NormalCompletion && value === alternate.value)
    );
    let loc =
      consequent instanceof AbruptCompletion
        ? consequent.location
        : alternate instanceof Completion
          ? alternate.location
          : alternate.expressionLocation;
    super(value, loc);
    this.joinCondition = joinCondition;
    consequent.effects = consequentEffects;
    alternate.effects = alternateEffects;
    this.consequent = consequent;
    this.alternate = alternate;
    this.savedEffects = savedEffects;
    this.savedPathConditions = savedPathConditions;
  }

  joinCondition: AbstractValue;
  consequent: Completion;
  alternate: Completion;
  savedEffects: void | Effects;
  // The path conditions that applied at the time of the oldest fork that caused this completion to arise.
  savedPathConditions: Array<AbstractValue>;

  // For convenience, this.consequent.effects should always be defined, but accessing it directly requires
  // verifying that with an invariant.
  get consequentEffects(): Effects {
    invariant(this.consequent.effects);
    return this.consequent.effects;
  }

  get alternateEffects(): Effects {
    invariant(this.alternate.effects);
    return this.alternate.effects;
  }

  // TODO blappert: these functions are a copy of those in ForkedAbruptCompletion, but the two classes will be unified
  // soon
  updateConsequentKeepingCurrentEffects(newConsequent: Completion): Completion {
    if (newConsequent instanceof NormalCompletion) this.value = newConsequent.value;
    let effects = this.consequentEffects;
    newConsequent.effects = effects;
    newConsequent.effects.result = newConsequent;
    this.consequent = newConsequent;
    return newConsequent;
  }

  updateAlternateKeepingCurrentEffects(newAlternate: Completion): Completion {
    if (newAlternate instanceof NormalCompletion) this.value = newAlternate.value;
    let effects = this.alternateEffects;
    newAlternate.effects = effects;
    newAlternate.effects.result = newAlternate;
    this.alternate = newAlternate;
    return newAlternate;
  }

  toDisplayString(): string {
    let superString = super.toDisplayString().slice(0, -1);
    return (
      superString + " c: [" + this.consequent.toDisplayString() + "] a: [" + this.alternate.toDisplayString() + "]]"
    );
  }

  getNormalCompletion(): SimpleNormalCompletion {
    let result;
    if (this.alternate instanceof SimpleNormalCompletion) {
      result = this.alternate;
    } else if (this.consequent instanceof SimpleNormalCompletion) {
      result = this.consequent;
    } else {
      if (this.alternate instanceof PossiblyNormalCompletion) {
        result = this.alternate.getNormalCompletion();
      } else {
        invariant(this.consequent instanceof PossiblyNormalCompletion);
        result = this.consequent.getNormalCompletion();
      }
    }
    invariant(result.value === this.value);
    return result;
  }

  containsCompletion(CompletionType: typeof Completion): boolean {
    if (this.consequent instanceof CompletionType) return true;
    if (this.alternate instanceof CompletionType) return true;
    if (this.consequent instanceof ForkedAbruptCompletion || this.consequent instanceof PossiblyNormalCompletion) {
      if (this.consequent.containsCompletion(CompletionType)) return true;
    }
    if (this.alternate instanceof ForkedAbruptCompletion || this.alternate instanceof PossiblyNormalCompletion) {
      if (this.alternate.containsCompletion(CompletionType)) return true;
    }
    return false;
  }

  containsBreakOrContinue(): boolean {
    if (this.consequent instanceof BreakCompletion || this.consequent instanceof ContinueCompletion) return true;
    if (this.alternate instanceof BreakCompletion || this.alternate instanceof ContinueCompletion) return true;
    if (this.consequent instanceof ForkedAbruptCompletion || this.consequent instanceof PossiblyNormalCompletion) {
      if (this.consequent.containsBreakOrContinue()) return true;
    }
    if (this.alternate instanceof ForkedAbruptCompletion || this.alternate instanceof PossiblyNormalCompletion) {
      if (this.alternate.containsBreakOrContinue()) return true;
    }
    return false;
  }
}
