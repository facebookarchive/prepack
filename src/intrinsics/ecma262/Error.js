/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow strict-local */

import type { Realm } from "../../realm.js";
import type { LexicalEnvironment } from "../../environment.js";
import {
  AbstractValue,
  ObjectValue,
  FunctionValue,
  NativeFunctionValue,
  StringValue,
  Value,
} from "../../values/index.js";
import { Get } from "../../methods/index.js";
import { Create, Properties, To } from "../../singletons.js";
import invariant from "../../invariant.js";
import type { BabelNodeSourceLocation } from "@babel/types";
import { PropertyDescriptor } from "../../descriptors.js";

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
  let key = loc || callerFn;

  // check if we've already encountered the callFn and if so
  // re-use that described location. plus we may get stuck trying
  // to get the location by recursively checking the same fun
  // so this also prevents a stack overflow
  if (key) {
    if (realm.alreadyDescribedLocations.has(key)) {
      return realm.alreadyDescribedLocations.get(key);
    }
    realm.alreadyDescribedLocations.set(key, undefined);
  }

  if (callerFn) {
    if (callerFn instanceof NativeFunctionValue) {
      locString = "native";
    }

    let name = callerFn._SafeGetDataPropertyValue("name");
    if (!name.mightBeUndefined()) displayName = To.ToStringPartial(realm, name);
    else name.throwIfNotConcrete();

    if (env && env.environmentRecord.$NewTarget) displayName = `new ${displayName}`;
  }

  if (!locString) {
    if (loc) {
      locString = `${loc.start.line}:${loc.start.column + 1}`;
      if (loc.source !== null) locString = `${loc.source}:${locString}`;
    } else {
      locString = (loc ? loc.source : undefined) || "unknown";
      if (!displayName) return undefined;
    }
  }

  let location;
  if (displayName) {
    location = `at ${displayName} (${locString})`;
  } else {
    location = `at ${locString}`;
  }
  if (key) {
    realm.alreadyDescribedLocations.set(key, location);
  }
  return location;
}

const buildStackTemplateSrc = 'A + (B ? ": " + B : "") + C';

function buildStack(realm: Realm, context: ObjectValue): Value {
  invariant(context.$ErrorData);

  let stack = context.$ErrorData.contextStack;
  if (!stack) return realm.intrinsics.undefined;

  let lines = [];
  let header = To.ToStringPartial(realm, Get(realm, context, "name"));

  let message = Get(realm, context, "message");
  if (!message.mightBeUndefined()) {
    message = To.ToStringValue(realm, message);
  } else {
    message.throwIfNotConcrete();
  }

  for (let executionContext of stack.reverse()) {
    let caller = executionContext.caller;
    if (!executionContext.loc) continue; // compiler generated helper for destructuring arguments
    let locString = describeLocation(
      realm,
      caller ? caller.function : undefined,
      caller ? caller.lexicalEnvironment : undefined,
      executionContext.loc
    );
    if (locString !== undefined) lines.push(locString);
  }
  let footer = `\n    ${lines.join("\n    ")}`;

  return message instanceof StringValue
    ? new StringValue(realm, `${header}${message.value ? `: ${message.value}` : ""}${footer}`)
    : AbstractValue.createFromTemplate(realm, buildStackTemplateSrc, StringValue, [
        new StringValue(realm, header),
        message,
        new StringValue(realm, footer),
      ]);
}

export function build(name: string, realm: Realm, inheritError?: boolean = true): NativeFunctionValue {
  let func = new NativeFunctionValue(realm, name, name, 1, (context, [message], argLength, NewTarget) => {
    // 1. If NewTarget is undefined, let newTarget be the active function object, else let newTarget be NewTarget.
    let newTarget = NewTarget || func;

    // 2. Let O be ? OrdinaryCreateFromConstructor(newTarget, "%ErrorPrototype%", « [[ErrorData]] »).
    let O = Create.OrdinaryCreateFromConstructor(realm, newTarget, `${name}Prototype`, { $ErrorData: undefined });
    O.$ErrorData = {
      contextStack: realm.contextStack.slice(1),
      locationData: undefined,
    };

    // 3. If message is not undefined, then
    if (!message.mightBeUndefined()) {
      // a. Let msg be ? ToString(message).
      let msg = message.getType() === StringValue ? message : To.ToStringValue(realm, message);

      // b. Let msgDesc be the PropertyDescriptor{[[Value]]: msg, [[Writable]]: true, [[Enumerable]]: false, [[Configurable]]: true}.
      let msgDesc = new PropertyDescriptor({
        value: msg,
        writable: true,
        enumerable: false,
        configurable: true,
      });

      // c. Perform ! DefinePropertyOrThrow(O, "message", msgDesc).
      Properties.DefinePropertyOrThrow(realm, O, "message", msgDesc);
    } else {
      message.throwIfNotConcrete();
    }

    // Build a text description of the stack.
    let stackDesc = new PropertyDescriptor({
      value: buildStack(realm, O),
      enumerable: false,
      configurable: true,
      writable: true,
    });
    Properties.DefinePropertyOrThrow(realm, O, "stack", stackDesc);

    // 4. Return O.
    return O;
  });

  if (inheritError) {
    func.$Prototype = realm.intrinsics.Error;
  }

  return func;
}
