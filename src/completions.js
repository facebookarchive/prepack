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
import { AbstractValue, Value } from "./values/index.js";

export class Completion {
  constructor(value: Value, location: ?BabelNodeSourceLocation, target?: ?string) {
    this.value = value;
    this.target = target;
    this.location = location;
  }

  value: Value;
  target: ?string;
  location: ?BabelNodeSourceLocation;
}

// Normal completions are returned just like spec completions
export class NormalCompletion extends Completion {}

// Abrupt completions are thrown as exeptions, to make it a easier
// to quickly get to the matching high level construct.
export class AbruptCompletion extends Completion {}

export class ThrowCompletion extends AbruptCompletion {
  constructor(value: Value, location: ?BabelNodeSourceLocation, nativeStack?: ?string) {
    super(value, location);
    this.nativeStack = nativeStack || new Error().stack;
  }

  nativeStack: string;
}
export class ContinueCompletion extends AbruptCompletion {
  constructor(value: Value, location: ?BabelNodeSourceLocation, target: ?string) {
    super(value, location, target);
  }
}

export class BreakCompletion extends AbruptCompletion {
  constructor(value: Value, location: ?BabelNodeSourceLocation, target: ?string) {
    super(value, location, target);
  }
}

export class ReturnCompletion extends AbruptCompletion {
  constructor(value: Value, location: ?BabelNodeSourceLocation) {
    super(value, location);
  }
}

export class JoinedAbruptCompletions extends AbruptCompletion {
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
    this.consequentEffects = consequentEffects;
    this.alternate = alternate;
    this.alternateEffects = alternateEffects;
  }

  joinCondition: AbstractValue;
  consequent: AbruptCompletion;
  consequentEffects: Effects;
  alternate: AbruptCompletion;
  alternateEffects: Effects;

  containsBreakOrContinue(): boolean {
    if (this.consequent instanceof BreakCompletion || this.consequent instanceof ContinueCompletion) return true;
    if (this.alternate instanceof BreakCompletion || this.alternate instanceof ContinueCompletion) return true;
    if (this.consequent instanceof JoinedAbruptCompletions) {
      if (this.consequent.containsBreakOrContinue()) return true;
    }
    if (this.alternate instanceof JoinedAbruptCompletions) {
      if (this.alternate.containsBreakOrContinue()) return true;
    }
    return false;
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
    savedEffects: void | Effects = undefined
  ) {
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
    let loc =
      consequent instanceof AbruptCompletion
        ? consequent.location
        : alternate instanceof Completion ? alternate.location : alternate.expressionLocation;
    super(value, loc);
    this.joinCondition = joinCondition;
    this.consequent = consequent;
    this.consequentEffects = consequentEffects;
    this.alternate = alternate;
    this.alternateEffects = alternateEffects;
    this.savedEffects = savedEffects;
  }

  joinCondition: AbstractValue;
  consequent: Completion | Value;
  consequentEffects: Effects;
  alternate: Completion | Value;
  alternateEffects: Effects;
  savedEffects: void | Effects;

  containsBreakOrContinue(): boolean {
    if (this.consequent instanceof BreakCompletion || this.consequent instanceof ContinueCompletion) return true;
    if (this.alternate instanceof BreakCompletion || this.alternate instanceof ContinueCompletion) return true;
    if (this.consequent instanceof JoinedAbruptCompletions || this.consequent instanceof PossiblyNormalCompletion) {
      if (this.consequent.containsBreakOrContinue()) return true;
    }
    if (this.alternate instanceof JoinedAbruptCompletions || this.alternate instanceof PossiblyNormalCompletion) {
      if (this.alternate.containsBreakOrContinue()) return true;
    }
    return false;
  }
}
