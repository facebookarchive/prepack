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
import { CompilerDiagnostic, FatalError, type Severity } from "../errors.js";
import { Get, InstanceofOperator } from "../methods/index.js";
import { Completion, ThrowCompletion } from "../completions.js";
import { ObjectValue, StringValue, Value } from "../values/index.js";
import { To } from "../singletons.js";
import invariant from "../invariant.js";
import { PropertyDescriptor } from "../descriptors.js";

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
  tryQuery<T>(f: () => T, defaultValue: T): T {
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
    realm.errorHandler = d => {
      if (d.severity === "Information" || d.severity === "Warning") return "Recover";
      return "Fail";
    };
    try {
      let result;
      let effects = realm.evaluateForEffects(
        () => {
          try {
            result = f();
          } catch (e) {
            if (e instanceof Completion) {
              result = defaultValue;
            } else if (e instanceof FatalError) {
              result = defaultValue;
            } else {
              throw e;
            }
          }
          return realm.intrinsics.undefined;
        },
        undefined,
        "tryQuery"
      );
      invariant(effects.result.value === realm.intrinsics.undefined);
      return ((result: any): T);
    } finally {
      realm.errorHandler = oldErrorHandler;
      realm.popContext(context);
    }
  }

  logCompletion(res: Completion): void {
    let realm = this.realm;
    let value = res.value;
    if (this.internalDebug) console.error(`=== ${res.constructor.name} ===`);
    if (
      this.tryQuery(
        () => value instanceof ObjectValue && InstanceofOperator(realm, value, realm.intrinsics.Error),
        false
      )
    ) {
      let object = ((value: any): ObjectValue);
      try {
        let err = new FatalError(
          this.tryQuery(() => To.ToStringPartial(realm, Get(realm, object, "message")), "(unknown message)")
        );
        err.stack = this.tryQuery(() => To.ToStringPartial(realm, Get(realm, object, "stack")), "(unknown stack)");
        console.error(err.message);
        console.error(err.stack);
        if (this.internalDebug && res instanceof ThrowCompletion) console.error(res.nativeStack);
      } catch (err) {
        let message = object.properties.get("message");
        console.error(
          message &&
          message.descriptor &&
          message.descriptor instanceof PropertyDescriptor &&
          message.descriptor.value instanceof StringValue
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
        value = To.ToStringPartial(realm, value);
      } catch (err) {
        value = err.message;
      }
      console.error(value);
      if (this.internalDebug && res instanceof ThrowCompletion) console.error(res.nativeStack);
    }
    this._hasErrors = true;
  }

  logError(value: Value, message: string): void {
    this._log(value, message, "RecoverableError");
    this._hasErrors = true;
  }

  logWarning(value: Value, message: string): void {
    this._log(value, message, "Warning");
  }

  logInformation(message: string): void {
    this._log(this.realm.intrinsics.undefined, message, "Information");
  }

  _log(value: Value, message: string, severity: Severity): void {
    let loc = value.expressionLocation;
    if (value.intrinsicName) {
      message = `${message}\nintrinsic name: ${value.intrinsicName}`;
    }
    let diagnostic = new CompilerDiagnostic(message, loc, "PP9000", severity);
    if (this.realm.handleError(diagnostic) === "Fail") throw new FatalError();
  }

  hasErrors(): boolean {
    return this._hasErrors;
  }
}
