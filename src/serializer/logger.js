/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

import { Realm, ExecutionContext } from "../realm.js";
import { ToStringPartial, Get, InstanceofOperator } from "../methods/index.js";
import { Completion, ThrowCompletion } from "../completions.js";
import { ObjectValue, StringValue } from "../values/index.js";
import invariant from "../invariant.js";

export class Logger {
  constructor(realm: Realm, internalDebug: boolean) {
    this.realm = realm;
    this._hasErrors = false;
    this.internalDebug = internalDebug;
  }

  realm: Realm;
  _hasErrors: boolean;
  internalDebug: boolean;

  // Wraps a query that might potentially execute user code.
  tryQuery<T>(f: () => T, onCompletion: T | (Completion => T), logCompletion: boolean): T {
    let context = new ExecutionContext();
    let realm = this.realm;
    let env = realm.$GlobalEnv;
    context.lexicalEnvironment = env;
    context.variableEnvironment = env;
    context.realm = realm;
    realm.pushContext(context);
    // We use partial evaluation so that we can throw away any state mutations
    try {
      let result;
      let effects = realm.partially_evaluate(() => {
        try {
          result = f();
        } catch (e) {
          if (e instanceof Completion) {
            if (logCompletion) this.logCompletion(e);
            result = onCompletion instanceof Function ? onCompletion(e) : onCompletion;
          } else {
            throw e;
          }
        }
        return realm.intrinsics.undefined;
      });
      invariant(effects[0] === realm.intrinsics.undefined);
      return ((result: any): T);
    } finally {
      realm.popContext(context);
    }
  }

  logCompletion(res: Completion) {
    let realm = this.realm;
    let value = res.value;
    if (this.internalDebug) console.error(`=== ${res.constructor.name} ===`);
    if (this.tryQuery(() => value instanceof ObjectValue && InstanceofOperator(realm, value, realm.intrinsics.Error), false, false)) {
      let object = ((value: any): ObjectValue);
      try {
        let err = new Error(this.tryQuery(() => ToStringPartial(realm, Get(realm, object, "message")), "(unknown message)", false));
        err.stack = this.tryQuery(() => ToStringPartial(realm, Get(realm, object, "stack")), "(unknown stack)", false);
        console.error(err.message);
        console.error(err.stack);
        if (this.internalDebug && res instanceof ThrowCompletion) console.error(res.nativeStack);
      } catch (err) {
        let message = object.properties.get("message");
        console.error((message && message.descriptor && message.descriptor.value instanceof StringValue) ? message.descriptor.value.value : "(no message available)");
        console.error(err.stack);
        console.error(object.$ContextStack);
      }
    } else {
      try {
        value = ToStringPartial(realm, value);
      } catch (err) {
        value = err.message;
      }
      console.error(value);
      if (this.internalDebug && res instanceof ThrowCompletion) console.error(res.nativeStack);
    }
    this._hasErrors = true;
  }

  logError(message: string) {
    console.error(message);
    this._hasErrors = true;
  }

  hasErrors() {
    return this._hasErrors;
  }
}
