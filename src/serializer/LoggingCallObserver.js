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
import { Realm, CallObserver } from "../realm.js";
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

export class LoggingCallObserver extends CallObserver {
  constructor(realm: Realm) {
    super();
    this.realm = realm;
    this.calls = [];
  }
  realm: Realm;
  calls: Array<string>;
  before(F: FunctionValue, thisArgument: void | Value, argumentsList: Array<Value>, newTarget: void | ObjectValue) {
    let realm = this.realm;
    let name = describeValue(realm, F);
    console.log(`${this.calls.map(_ => "  ").join("")}>${name}(${argumentsList.map(v => describeValue(realm, v)).join(", ")})`);
    this.calls.push(name);
  }

  after(F: FunctionValue, thisArgument: void | Value, argumentsList: Array<Value>, newTarget: void | ObjectValue, result: void | Reference | Value | AbruptCompletion) {
    let name = this.calls.pop();
    console.log(`${this.calls.map(_ => "  ").join("")}<${name}${result instanceof ThrowCompletion ? ": error" : ""}`);
  }
}
