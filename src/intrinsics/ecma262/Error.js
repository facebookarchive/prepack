/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

import type { Realm } from "../../realm.js";
import type { LexicalEnvironment } from "../../environment.js";
import { ObjectValue, FunctionValue, NativeFunctionValue, StringValue } from "../../values/index.js";
import { Get, OrdinaryCreateFromConstructor, ToStringPartial, ToStringValue } from "../../methods/index.js";
import { Properties } from "../../singletons.js";
import invariant from "../../invariant.js";
import type { BabelNodeSourceLocation } from "babel-types";

export default function(realm: Realm): NativeFunctionValue {
  return build("Error", realm, false);
}

export function describeLocation(
  realm: Realm,
  callerFn: ?FunctionValue,
  env: ?LexicalEnvironment,
  loc: ?BabelNodeSourceLocation
): void | string {
  let locString = "";
  let displayName = "";

  if (callerFn) {
    if (callerFn instanceof NativeFunctionValue) {
      locString = "native";
    }

    let name = callerFn.$Get("name", callerFn);
    if (!name.mightBeUndefined()) displayName = ToStringPartial(realm, name);
    else name.throwIfNotConcrete();

    if (env && env.$NewTarget) displayName = `new ${displayName}`;
  }

  if (!locString) {
    if (loc) {
      locString = `${loc.start.line}:${loc.start.column + 1}`;
      if (loc.source) locString = `${loc.source}:${locString}`;
    } else {
      locString = (loc ? loc.source : undefined) || "unknown";
      if (!displayName) return undefined;
    }
  }

  if (displayName) {
    return `at ${displayName} (${locString})`;
  } else {
    return `at ${locString}`;
  }
}

function buildStack(realm: Realm, context: ObjectValue) {
  invariant(context.$ErrorData);

  let stack = context.$ErrorData.contextStack;
  if (!stack) return realm.intrinsics.undefined;

  let lines = [];
  let header = "";

  header += ToStringPartial(realm, Get(realm, context, "name"));

  let msg = Get(realm, context, "message");
  if (!msg.mightBeUndefined()) {
    msg = ToStringPartial(realm, msg);
    if (msg) header += `: ${msg}`;
  } else {
    msg.throwIfNotConcrete();
  }

  for (let executionContext of stack.reverse()) {
    let caller = executionContext.caller;
    let locString = describeLocation(
      realm,
      caller ? caller.function : undefined,
      caller ? caller.lexicalEnvironment : undefined,
      executionContext.loc
    );
    if (locString !== undefined) lines.push(locString);
  }

  return new StringValue(realm, `${header}\n    ${lines.join("\n    ")}`);
}

export function build(name: string, realm: Realm, inheritError?: boolean = true): NativeFunctionValue {
  let func = new NativeFunctionValue(realm, name, name, 1, (context, [message], argLength, NewTarget) => {
    // 1. If NewTarget is undefined, let newTarget be the active function object, else let newTarget be NewTarget.
    let newTarget = NewTarget || func;

    // 2. Let O be ? OrdinaryCreateFromConstructor(newTarget, "%ErrorPrototype%", « [[ErrorData]] »).
    let O = OrdinaryCreateFromConstructor(realm, newTarget, `${name}Prototype`, { $ErrorData: undefined });
    O.$ErrorData = {
      contextStack: realm.contextStack.slice(1),
      locationData: undefined,
    };

    // Build a text description of the stack.
    let stackDesc = {
      value: buildStack(realm, O),
      enumerable: false,
      configurable: true,
      writable: true,
    };
    Properties.DefinePropertyOrThrow(realm, O, "stack", stackDesc);

    // 3. If message is not undefined, then
    if (!message.mightBeUndefined()) {
      // a. Let msg be ? ToString(message).
      let msg = message.getType() === StringValue ? message : ToStringValue(realm, message);

      // b. Let msgDesc be the PropertyDescriptor{[[Value]]: msg, [[Writable]]: true, [[Enumerable]]: false, [[Configurable]]: true}.
      let msgDesc = {
        value: msg,
        writable: true,
        enumerable: false,
        configurable: true,
      };

      // c. Perform ! DefinePropertyOrThrow(O, "message", msgDesc).
      Properties.DefinePropertyOrThrow(realm, O, "message", msgDesc);
    } else {
      message.throwIfNotConcrete();
    }

    // 4. Return O.
    return O;
  });

  if (inheritError) {
    func.$Prototype = realm.intrinsics.Error;
  }

  return func;
}
