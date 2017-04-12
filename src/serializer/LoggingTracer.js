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
import { ToStringPartial, Get } from "../methods/index.js";
import { ThrowCompletion, AbruptCompletion } from "../completions.js";
import { FunctionValue, Value, NumberValue, BooleanValue, StringValue, UndefinedValue, NullValue, ObjectValue, AbstractValue } from "../values/index.js";
import invariant from "../invariant.js";

function describeValue(realm: Realm, v: Value): string {
  if (v instanceof NumberValue || v instanceof BooleanValue) return v.value.toString();
  if (v instanceof UndefinedValue) return "undefined";
  if (v instanceof NullValue) return "null";
  if (v instanceof StringValue) return `"${v.value}"`; // TODO: proper escaping
  if (v instanceof FunctionValue) return ToStringPartial(realm, Get(realm, v, "name")) || "(anonymous function)";
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

  log(message: string) {
    console.log(`${this.nesting.map(_ => "  ").join("")}${message}`);
  }

  beginPartialEvaluation() {
    this.log(`>partial evaluation`);
    this.nesting.push("(partial evaluation)");
  }

  endPartialEvaluation(effects: void | Effects) {
    let name = this.nesting.pop();
    invariant(name === "(partial evaluation)");
    this.log(`<partial evaluation`);
  }

  beforeCall(F: FunctionValue, thisArgument: void | Value, argumentsList: Array<Value>, newTarget: void | ObjectValue) {
    let realm = this.realm;
    let name = describeValue(realm, F);
    this.log(`>${name}(${argumentsList.map(v => describeValue(realm, v)).join(", ")})`);
    this.nesting.push(name);
  }

  afterCall(F: FunctionValue, thisArgument: void | Value, argumentsList: Array<Value>, newTarget: void | ObjectValue, result: void | Reference | Value | AbruptCompletion) {
    let name = this.nesting.pop();
    this.log(`<${name}${result instanceof ThrowCompletion ? ": error" : ""}`);
  }
}
