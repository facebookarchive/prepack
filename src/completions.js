/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

import { AbstractValue, Value } from "./values/index.js";
import type { Effects, Realm } from "./realm.js";
import invariant from "./invariant.js";

export class Completion {
  constructor(value: Value, target?: ?string) {
    this.value  = value;
    this.target = target;
  }

  value: Value;
  target: ?string;
}
// Abrupt completions are thrown as exeptions, to make it a easier
// to quickly get to the matching high level construct.
export class AbruptCompletion extends Completion {}
// Normal completions are returned just like spec completions
export class NormalCompletion extends Completion {}

export class ThrowCompletion extends AbruptCompletion {
  constructor(value: Value, nativeStack?: ?string) {
    super(value);
    invariant(value.getType() !== value.$Realm.intrinsics.__IntrospectionError ||
      this instanceof IntrospectionThrowCompletion);
    this.nativeStack = nativeStack || new Error().stack;
  }

  nativeStack: string;
}
export class IntrospectionThrowCompletion extends ThrowCompletion {
  reason: void | "readonly";
}
export class ContinueCompletion extends AbruptCompletion {}
export class BreakCompletion extends AbruptCompletion {}
export class ReturnCompletion extends AbruptCompletion {}

export class ComposedAbruptCompletion extends AbruptCompletion {
  constructor(
      priorCompletion: NormalCompletion,
      subsequentCompletion: AbruptCompletion) {
    super(subsequentCompletion.value, subsequentCompletion.target);
    this.priorCompletion = priorCompletion;
    this.subsequentCompletion = subsequentCompletion;
  }

  priorCompletion: NormalCompletion;
  subsequentCompletion: AbruptCompletion;

  throwIntrospectionError<T>(): T {
    if (this.priorCompletion instanceof PossiblyNormalCompletion)
      return AbstractValue.throwIntrospectionError(this.priorCompletion.joinCondition);
    invariant(this.subsequentCompletion instanceof PossiblyNormalCompletion);
    return AbstractValue.throwIntrospectionError(this.subsequentCompletion.joinCondition);
  }
}

export class JoinedAbruptCompletions extends AbruptCompletion {
  constructor(
      realm: Realm,
      joinCondition: AbstractValue,
      consequent: AbruptCompletion,
      consequentEffects: Effects,
      alternate: AbruptCompletion,
      alternateEffects: Effects) {
    super(realm.intrinsics.empty, undefined);
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
}

// Possibly normal completions have to be treated like normal completions
// and are thus never thrown. At the end of a try block or loop body, however,
// action must be taken to deal with the possibly abrupt case of the completion.
export class PossiblyNormalCompletion extends NormalCompletion {
  constructor(
      joinCondition: AbstractValue,
      consequent: Completion | Value,
      consequentEffects: Effects,
      alternate: Completion | Value,
      alternateEffects: Effects) {
    invariant(consequent instanceof NormalCompletion || consequent instanceof Value ||
       alternate instanceof NormalCompletion || alternate instanceof Value);
    invariant(consequent instanceof AbruptCompletion || alternate instanceof AbruptCompletion);
    super(alternate instanceof Value ? alternate : alternate.value);
    this.joinCondition = joinCondition;
    this.consequent = consequent;
    this.consequentEffects = consequentEffects;
    this.alternate = alternate;
    this.alternateEffects = alternateEffects;
  }

  joinCondition: AbstractValue;
  consequent: Completion | Value;
  consequentEffects: Effects;
  alternate: Completion | Value;
  alternateEffects: Effects;
}
