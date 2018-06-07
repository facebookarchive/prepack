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
import { Effects, type Realm } from "./realm.js";
import { AbstractValue, Value } from "./values/index.js";

export class Completion {
  constructor(value: Value, location: ?BabelNodeSourceLocation, target?: ?string) {
    this.value = value;
    this.target = target;
    this.location = location;
  }

  _value: Value;

  get value(): Value {
    if (this.effects) {
      invariant(this === this.effects.result, "Result of effects must be equal to this");
      invariant(this._value === this.effects.result._value, "effects.result.value !== this.value");
    }
    return this._value;
  }

  set value(newValue: Value) {
    this._value = newValue;
    if (this.effects) this.effects.result = newValue;
  }

  target: ?string;
  location: ?BabelNodeSourceLocation;
  //effects: ?Effects;

  _effects: ?Effects;
  get effects(): ?Effects {
    return this._effects;
  }

  set effects(newEffects: Effects) {
    invariant(newEffects);
    // Temporary fixup for when we have a NormalCompletion and we're assinging a new set of
    // Effects that has a result that is a Value instead of a NormalCompletion
    if (newEffects.result instanceof Value) {
      this.value = newEffects.result;
      newEffects.result = this;
    }
    invariant(newEffects.result === this, "A completion's effects should always result in itself")
    this._effects = newEffects;
  }
}

// Normal completions are returned just like spec completions (usually)
export class NormalCompletion extends Completion {
  constructor(value: Value, effects?: Effects | BabelNodeSourceLocation | null | void, target?: ?string) {
    if (effects instanceof Effects) {
      super(value);
      invariant(effects.result === value);
      effects.result = this;
      this.effects = effects;
    } else if (effects) {
      super(value, ((effects: any): BabelNodeSourceLocation), target);
    } else {
      super(value);
    }
  }
}

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
    this.joinCondition = joinCondition;
    this.consequent = consequent;
    this.consequent.effects = consequentEffects;
    this.alternate = alternate;
    this.alternate.effects = alternateEffects;
    invariant(this.consequentEffects);
    invariant(this.alternateEffects);
    invariant(this.consequentEffects.result === this.consequent);
    invariant(this.alternateEffects.result === this.alternate);
  }

  joinCondition: AbstractValue;
  //consequent: AbruptCompletion;
  _consequent: AbruptCompletion;
  get consequent(): AbruptCompletion {
    return this._consequent;
  }

  set consequent(newAbruptCompletion: AbruptCompletion) {
    invariant(newAbruptCompletion instanceof Completion);
    this._consequent = newAbruptCompletion;
  }
  //alternate: AbruptCompletion;
  _alternate: AbruptCompletion;
  get alternate(): AbruptCompletion {
    return this._alternate;
  }

  set alternate(newAbruptCompletion: AbruptCompletion) {
    invariant(newAbruptCompletion instanceof Completion);
    this._alternate = newAbruptCompletion;
  }
  // end debug code

  get consequentEffects(): Effects {
    invariant(this.consequent.effects);
    return this.consequent.effects;
  }

  get alternateEffects(): Effects {
    invariant(this.alternate.effects);
    return this.alternate.effects;
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
    consequent: Completion | Value,
    consequentEffects: Effects,
    alternate: Completion | Value,
    alternateEffects: Effects,
    savedPathConditions: Array<AbstractValue>,
    savedEffects: void | Effects = undefined
  ) {
    invariant(consequent === consequentEffects.result);
    invariant(alternate === alternateEffects.result);
    invariant(
      consequent instanceof NormalCompletion ||
        consequent instanceof Value ||
        alternate instanceof NormalCompletion ||
        alternate instanceof Value
    );
    invariant(consequent instanceof AbruptCompletion || alternate instanceof AbruptCompletion);
    invariant(
      value === consequent ||
        consequent instanceof AbruptCompletion ||
        (consequent instanceof NormalCompletion && value === consequent.value)
    );
    invariant(
      value === alternate ||
        alternate instanceof AbruptCompletion ||
        (alternate instanceof NormalCompletion && value === alternate.value)
    );
    if (consequent instanceof Value) {
      // TODO: location?
      consequent = new NormalCompletion(consequent, consequentEffects);
    }
    if (alternate instanceof Value) {
      alternate = new NormalCompletion(alternate, alternateEffects);
    }
    consequent.effects = consequentEffects;
    alternate.effects = alternateEffects;
    let loc =
      consequent instanceof AbruptCompletion
        ? consequent.location
        : alternate instanceof Completion
          ? alternate.location
          : alternate.expressionLocation;
    super(value, loc);
    this.joinCondition = joinCondition;
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

  get consequentEffects(): Effects {
    invariant(this.consequent.effects);
    return this.consequent.effects;
  }

  get alternateEffects(): Effects {
    invariant(this.alternate.effects);
    return this.alternate.effects;
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
