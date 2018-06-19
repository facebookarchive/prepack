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
import { AbstractValue, Value, EmptyValue } from "./values/index.js";

export class Completion {
  constructor(value: Value, location: ?BabelNodeSourceLocation, target?: ?string) {
    this.value = value;
    this.target = target;
    this.location = location;
  }

  value: Value;
  target: ?string;
  location: ?BabelNodeSourceLocation;
  _effects: ?Effects;
  get effects() {
    return this._effects;
  }
  set effects(newEffects: Effects): Effects {
    invariant(newEffects);
    this._effects = newEffects;
    return newEffects;
  }

  toDisplayString(): string {
    return "[" + this.constructor.name + " value " + (this.value ? this.value.toDisplayString() : "undefined") + "]";
  }
}

// Normal completions are returned just like spec completions
export class NormalCompletion extends Completion {}

// SimpleNormalCompletions are returned just like spec completions. This class exists as the parallel for
// PossiblyNormalCompletion to make comparisons easier.
export class SimpleNormalCompletion extends NormalCompletion {}

// Abrupt completions are thrown as exeptions, to make it a easier
// to quickly get to the matching high level construct.
export class AbruptCompletion extends Completion {}

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
  _consequent: AbruptCompletion;
  updateConsequentKeepingCurrentEffects(newConsequent: AbruptCompletion) {
    let effects = this.consequentEffects;
    newConsequent.effects = effects;
    newConsequent.effects.result = newConsequent;
    this.consequent = newConsequent;
    return newConsequent;
  }
  updateAlternateKeepingCurrentEffects(newAlternate: AbruptCompletion) {
    let effects = this.alternateEffects;
    newAlternate.effects = effects;
    newAlternate.effects.result = newAlternate;
    this.alternate = newAlternate;
    return newAlternate;
  }
  get consequent(): AbruptCompletion { return this._consequent; }
  set consequent(newConsequent: AbruptCompletion) {
    //invariant(newConsequent instanceof AbruptCompletion);
    invariant(newConsequent);
    invariant(newConsequent.effects);
    this._consequent = newConsequent;
    return newConsequent;
  }
  //consequentEffects: Effects;
  get consequentEffects(): Effects {
    invariant(this.consequent.effects);
    return this.consequent.effects;
  }

  _alternate: AbruptCompletion;
  get alternate(): AbruptCompletion { return this._alternate; }
  set alternate(newConsequent: AbruptCompletion) {
    invariant(newConsequent.effects);
    this._alternate = newConsequent;
    return newConsequent;
  }
  get alternateEffects(): Effects {
    invariant(this.alternate.effects);
    return this.alternate.effects;
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
  _consequent: Completion;
  get consequent(): Completion { return this._consequent; }
  set consequent(newConsequent: Completion) {
    invariant(newConsequent);
    invariant(newConsequent.effects);
    this._consequent = newConsequent;
    return newConsequent;
  }
  get consequentEffects(): Effects {
    invariant(this.consequent.effects);
    return this.consequent.effects;
  }
  _alternate: Completion;
  get alternate(): Completion { return this._alternate; }
  set alternate(newConsequent: Completion) {
    invariant(newConsequent.effects);
    this._alternate = newConsequent;
    return newConsequent;
  }
  get alternateEffects(): Effects {
    invariant(this.alternate.effects);
    return this.alternate.effects;
  }

  savedEffects: void | Effects;
  // The path conditions that applied at the time of the oldest fork that caused this completion to arise.
  savedPathConditions: Array<AbstractValue>;

  updateConsequentKeepingCurrentEffects(newConsequent: Completion) {
    let effects = this.consequentEffects;
    newConsequent.effects = effects;
    newConsequent.effects.result = newConsequent;
    this.consequent = newConsequent;
    return newConsequent;
  }
  updateAlternateKeepingCurrentEffects(newAlternate: Completion) {
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
