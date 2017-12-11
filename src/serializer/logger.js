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
import { FatalError } from "../errors.js";
import { ToStringPartial, Get, InstanceofOperator } from "../methods/index.js";
import { Completion, ThrowCompletion } from "../completions.js";
import { ObjectValue, StringValue, Value } from "../values/index.js";
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
  tryQuery<T>(f: () => T, defaultValue: T, logFailures: boolean): T {
    let realm = this.realm;
    let context = new ExecutionContext();
    context.isStrict = realm.isStrict;
    let env = realm.$GlobalEnv;
    context.lexicalEnvironment = env;
    context.variableEnvironment = env;
    context.realm = realm;
    realm.pushContext(context);
    // We use partial evaluation so that we can throw away any state mutations
    let oldErrorHandler = realm.errorHandler;
    let newErrorHandler;
    realm.errorHandler = newErrorHandler = d => {
      if (d.severity === "Information" || d.severity === "Warning") return "Recover";
      if (logFailures) {
        realm.errorHandler = oldErrorHandler;
        realm.handleError(d);
        realm.errorHandler = newErrorHandler;
      }
      return "Fail";
    };
    try {
      let result;
      let effects = realm.evaluateForEffects(() => {
        try {
          result = f();
        } catch (e) {
          if (e instanceof Completion) {
            if (logFailures) this.logCompletion(e);
            result = defaultValue;
          } else if (e instanceof FatalError) {
            result = defaultValue;
          } else {
            throw e;
          }
        }
        return realm.intrinsics.undefined;
      });
      invariant(effects[0] === realm.intrinsics.undefined);
      return ((result: any): T);
    } finally {
      realm.errorHandler = oldErrorHandler;
      realm.popContext(context);
    }
  }

  logCompletion(res: Completion) {
    let realm = this.realm;
    let value = res.value;
    if (this.internalDebug) console.error(`=== ${res.constructor.name} ===`);
    if (
      this.tryQuery(
        () => value instanceof ObjectValue && InstanceofOperator(realm, value, realm.intrinsics.Error),
        false,
        false
      )
    ) {
      let object = ((value: any): ObjectValue);
      try {
        let err = new FatalError(
          this.tryQuery(() => ToStringPartial(realm, Get(realm, object, "message")), "(unknown message)", false)
        );
        err.stack = this.tryQuery(() => ToStringPartial(realm, Get(realm, object, "stack")), "(unknown stack)", false);
        console.error(err.message);
        console.error(err.stack);
        if (this.internalDebug && res instanceof ThrowCompletion) console.error(res.nativeStack);
      } catch (err) {
        let message = object.properties.get("message");
        console.error(
          message && message.descriptor && message.descriptor.value instanceof StringValue
            ? message.descriptor.value.value
            : "(no message available)"
        );
        console.error(err.stack);
        if (object.$ErrorData) {
          console.error(object.$ErrorData.contextStack);
        }
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

  logError(value: Value, message: string) {
    let loc = value.expressionLocation;
    if (loc) {
      let locString = `${loc.start.line}:${loc.start.column + 1}`;
      if (loc.source) locString = `${loc.source}:${locString}`;
      message = `${message}\nat: ${locString}`;
    } else if (value.intrinsicName) {
      message = `${message}\nintrinsic name: ${value.intrinsicName}`;
    }

    console.error(message);
    this._hasErrors = true;
  }

  hasErrors() {
    return this._hasErrors;
  }
}
