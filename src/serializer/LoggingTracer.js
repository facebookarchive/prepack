/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

import { Reference } from "../environment.js";
import { Realm, Tracer } from "../realm.js";
import type { Effects } from "../realm.js";
import { Get } from "../methods/index.js";
import { ThrowCompletion, AbruptCompletion } from "../completions.js";
import {
  FunctionValue,
  Value,
  NumberValue,
  BooleanValue,
  StringValue,
  UndefinedValue,
  NullValue,
  ObjectValue,
  AbstractValue,
} from "../values/index.js";
import { To } from "../singletons.js";
import invariant from "../invariant.js";
import { stringOfLocation } from "../utils/babelhelpers.js";

function describeValue(realm: Realm, v: Value): string {
  if (v instanceof NumberValue || v instanceof BooleanValue) return v.value.toString();
  if (v instanceof UndefinedValue) return "undefined";
  if (v instanceof NullValue) return "null";
  if (v instanceof StringValue) return JSON.stringify(v.value);
  if (v instanceof FunctionValue) return To.ToStringPartial(realm, Get(realm, v, "name")) || "(anonymous function)";
  if (v instanceof ObjectValue) return "(some object)";
  if (v instanceof AbstractValue) return "(some abstract value)";
  invariant(false);
}

export class LoggingTracer extends Tracer {
  constructor(realm: Realm) {
    super();
    this.realm = realm;
    this.nesting = [];
  }

  realm: Realm;
  nesting: Array<string>;

  log(message: string): void {
    console.log(`[calls] ${this.nesting.map(_ => "  ").join("")}${message}`);
  }

  beginEvaluateForEffects(state: any): void {
    this.log(`>evaluate for effects`);
    this.nesting.push("(evaluate for effects)");
  }

  endEvaluateForEffects(state: any, effects: void | Effects): void {
    let name = this.nesting.pop();
    invariant(name === "(evaluate for effects)");
    this.log(`<evaluate for effects`);
  }

  beforeCall(
    F: FunctionValue,
    thisArgument: void | Value,
    argumentsList: Array<Value>,
    newTarget: void | ObjectValue
  ): void {
    let realm = this.realm;
    let name = describeValue(realm, F);
    this.log(`>${name}(${argumentsList.map(v => describeValue(realm, v)).join(", ")})`);
    this.nesting.push(name);
  }

  afterCall(
    F: FunctionValue,
    thisArgument: void | Value,
    argumentsList: Array<Value>,
    newTarget: void | ObjectValue,
    result: void | Reference | Value | AbruptCompletion
  ): void {
    let name = this.nesting.pop();
    this.log(`<${name}${result instanceof ThrowCompletion ? ": error" : ""}`);
  }

  beginOptimizingFunction(optimizedFunctionId: number, functionValue: FunctionValue): void {
    this.log(
      `>Starting Optimized Function ${optimizedFunctionId} ${
        functionValue.intrinsicName ? functionValue.intrinsicName : "[unknown name]"
      } ${functionValue.expressionLocation ? stringOfLocation(functionValue.expressionLocation) : ""}`
    );
  }

  endOptimizingFunction(optimizedFunctionId: number): void {
    this.log(`<Ending Optimized Function ${optimizedFunctionId}`);
  }
}
