/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

import invariant from "../../invariant.js";
import { Realm } from "../../realm.js";
import { AbruptCompletion, ThrowCompletion } from "../../completions.js";
import {
  Value,
  ConcreteValue,
  BooleanValue,
  EmptyValue,
  NativeFunctionValue,
  ObjectValue,
  StringValue,
  UndefinedValue,
} from "../../values/index.js";
import { Get, GetFunctionRealm } from "../../methods/index.js";
import { Properties, To } from "../../singletons.js";
import parse from "../../utils/parse.js";
import type { BabelNodeFile } from "@babel/types";

// TODO: This creates a strong dependency on babel and its transforms even
// outside of devDependencies which is unfortunate. Get rid of this once classes
// and destructuring is fully implemented.
import { transform as babelTransform } from "@babel/core";

// Hook for transpiling
function transform(code: string, filename: string): string {
  let patchedCode = code.replace(
    // Work around the fact that Babel classes can't extend natives.
    /class FastBuffer extends Uint8Array {\s+constructor\(arg1, arg2, arg3\) {\s+super\(arg1, arg2, arg3\);\s+}\s+}/g,
    "function FastBuffer(arg1, arg2, arg3) {\n" +
      "  var self = new Uint8Array(arg1, arg2, arg3);\n" +
      "  Object.setPrototypeOf(self, FastBuffer.prototype);\n" +
      "  return self;\n" +
      "}; Object.setPrototypeOf(FastBuffer, Uint8Array); Object.setPrototypeOf(FastBuffer.prototype, Uint8Array.prototype);"
  );
  let transformedCode = babelTransform(patchedCode, {
    plugins: [
      // Prepack doesn't support classes or destructuring yet.
      "transform-es2015-classes",
      "transform-es2015-destructuring",
      "transform-es2015-parameters",
    ],
    retainLines: true,
  });
  return transformedCode.code;
}

export default function(realm: Realm): ObjectValue {
  let intrinsicName = 'process.binding("contextify")';
  let obj = new ObjectValue(realm, realm.intrinsics.ObjectPrototype, intrinsicName);

  // Contextify

  function runInDebugContextImpl(code) {
    // TODO: Make this an abstract result.
    throw realm.createErrorThrowCompletion(
      realm.intrinsics.Error,
      "The V8 debugger is not available from within Prepack."
    );
  }

  function makeContextImpl() {
    // TODO: Allow sub-realms to be created and restored.
    throw realm.createErrorThrowCompletion(realm.intrinsics.Error, "makeContext is not yet implemented in Prepack.");
  }

  function isContextImpl() {
    // TODO: We don't have a way to create contexts so this is always false.
    return realm.intrinsics.false;
  }

  // ContextifyScript

  class ContextifyScriptInternal {
    ast: BabelNodeFile;
    constructor(ast: BabelNodeFile) {
      this.ast = ast;
    }
  }

  function ContextifyScriptConstructor(context, args, argLength, newTarget) {
    if (!newTarget) {
      throw realm.createErrorThrowCompletion(realm.intrinsics.Error, "Must call vm.Script as a constructor.");
    }
    let proto = Get(realm, newTarget, "prototype");
    if (!(proto instanceof ObjectValue)) {
      realm = GetFunctionRealm(realm, newTarget);
      proto = ContextifyScriptPrototype;
    }

    invariant(args[0] instanceof ConcreteValue);
    let code = To.ToString(realm, args[0]);

    let options = args[1];
    let filename = getFilenameArg(options);
    let lineOffset = getLineOffsetArg(options);
    let columnOffset = getColumnOffsetArg(options);
    let displayErrors = getDisplayErrorsArg(options);
    let cachedDataBuf = getCachedData(options);
    let produceCachedData = getProduceCachedData(options);

    let resolvedOptions = {
      filename: filename,
      lineOffset: lineOffset,
      columnOffset: columnOffset,
      displayErrors: displayErrors,
      cachedDataBuf: undefined, // Not serializable.
      produceCachedData: produceCachedData,
    };

    let intrinsicConstructor = `new (${intrinsicName}).ContextifyScript(${JSON.stringify(code)}, ${JSON.stringify(
      resolvedOptions
    )})`;

    let self = new ObjectValue(realm, proto, intrinsicConstructor);

    if (cachedDataBuf.length) {
      Properties.Set(realm, obj, "cachedDataRejected", realm.intrinsics.true, true);
    }

    if (produceCachedData) {
      Properties.Set(realm, obj, "cachedDataProduced", realm.intrinsics.false, true);
    }

    let ast;
    try {
      // TODO: Somehow pass columnOffset to Babylon.
      ast = parse(realm, transform(code, filename), filename, "script", 1 + lineOffset);
    } catch (e) {
      if (displayErrors && e instanceof ThrowCompletion) {
        decorateErrorStack(e);
      }
      throw e;
    }
    // TODO: Pick up source map files and automatically fix up source locations.

    (self: any).$InternalSlot = new ContextifyScriptInternal(ast);

    return self;
  }

  let runInDebugContext = new NativeFunctionValue(
    realm,
    `${intrinsicName}.runInDebugContext`,
    "runInDebugContext",
    0,
    runInDebugContextImpl
  );
  Properties.Set(realm, obj, "runInDebugContext", runInDebugContext, true);

  let makeContext = new NativeFunctionValue(realm, `${intrinsicName}.makeContext`, "makeContext", 0, makeContextImpl);
  Properties.Set(realm, obj, "makeContext", makeContext, true);

  let isContext = new NativeFunctionValue(realm, `${intrinsicName}.isContext`, "isContext", 0, isContextImpl);
  Properties.Set(realm, obj, "isContext", isContext, true);

  let ContextifyScript = new NativeFunctionValue(
    realm,
    `${intrinsicName}.ContextifyScript`,
    "ContextifyScript",
    0,
    ContextifyScriptConstructor,
    true
  );
  Properties.Set(realm, obj, "ContextifyScript", ContextifyScript, true);

  // ContextifyScript.prototype

  function runInThisContext(self, args) {
    let timeout = getTimeoutArg(args[0]);
    let displayErrors = getDisplayErrorsArg(args[0]);
    let breakOnSigint = getBreakOnSigintArg(args[0]);
    return evalMachine(self, timeout, displayErrors, breakOnSigint);
  }

  function runInContext(self, [sandbox, options]) {
    throw realm.createErrorThrowCompletion(
      realm.intrinsics.Error,
      "Cannot run in arbitrary contexts within Prepack yet."
    );
  }

  function decorateErrorStack(completion: AbruptCompletion): void {
    let error = completion.value;
    if (!(error instanceof ObjectValue)) {
      return;
    }

    let errorData = error.$ErrorData;
    if (!errorData) {
      return;
    }
    let errorLocation = errorData.locationData;
    if (!errorLocation || errorLocation.stackDecorated) {
      return;
    }

    let stack = Get(realm, error, "stack");
    if (!(stack instanceof StringValue)) {
      return;
    }

    let lines = errorLocation.sourceCode.split(/\r?\n/);
    let line = lines[errorLocation.loc.line - 1] || "";
    let arrow = " ".repeat(errorLocation.loc.column) + "^";
    let decoratedStack = `${errorLocation.filename}:${errorLocation.loc.line}\n${line}\n${arrow}\n${stack.value}`;
    Properties.Set(realm, error, "stack", new StringValue(realm, decoratedStack), false);

    errorLocation.stackDecorated = true;
  }

  function getBreakOnSigintArg(options: Value): boolean {
    if (options instanceof UndefinedValue || options instanceof StringValue) {
      return false;
    }
    if (!(options instanceof ObjectValue)) {
      throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError, "options must be an object");
    }

    let value = Get(realm, options, "breakOnSigint");
    invariant(value instanceof ConcreteValue);
    return value instanceof BooleanValue && value.value;
  }

  function getTimeoutArg(options: Value): number {
    if (options instanceof UndefinedValue || options instanceof StringValue) {
      return -1;
    }
    if (!(options instanceof ObjectValue)) {
      throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError, "options must be an object");
    }

    let value = Get(realm, options, "timeout");
    invariant(value instanceof ConcreteValue);
    if (value instanceof UndefinedValue) {
      return -1;
    }
    let timeout = To.ToInteger(realm, value);

    if (timeout <= 0) {
      throw realm.createErrorThrowCompletion(realm.intrinsics.RangeError, "timeout must be a positive number");
    }

    return timeout;
  }

  function getDisplayErrorsArg(options: Value): boolean {
    if (options instanceof UndefinedValue || options instanceof StringValue) {
      return true;
    }
    if (!(options instanceof ObjectValue)) {
      throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError, "options must be an object");
    }

    let value = Get(realm, options, "displayErrors");
    invariant(value instanceof ConcreteValue);
    if (value instanceof UndefinedValue) {
      return true;
    }
    return To.ToBoolean(realm, value);
  }

  function getFilenameArg(options: Value): string {
    const defaultFilename = "evalmachine.<anonymous>";
    if (options instanceof UndefinedValue) {
      return defaultFilename;
    }
    if (options instanceof StringValue) {
      return options.value;
    }
    if (!(options instanceof ObjectValue)) {
      throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError, "options must be an object");
    }

    let value = Get(realm, options, "filename");
    invariant(value instanceof ConcreteValue);
    if (value instanceof UndefinedValue) {
      return defaultFilename;
    }
    return To.ToString(realm, value);
  }

  function getCachedData(options: Value): Uint8Array {
    if (!(options instanceof ObjectValue)) {
      return new Uint8Array(0);
    }

    let value = Get(realm, options, "cachedData");
    invariant(value instanceof ConcreteValue);
    if (value instanceof UndefinedValue) {
      return new Uint8Array(0);
    }

    if (
      !(value instanceof ObjectValue) ||
      !value.$ViewedArrayBuffer ||
      !(value.$ViewedArrayBuffer.$ArrayBufferData instanceof Uint8Array)
    ) {
      throw realm.createErrorThrowCompletion(
        realm.intrinsics.TypeError,
        "options.cachedData must be a Buffer instance"
      );
    }

    return value.$ViewedArrayBuffer.$ArrayBufferData;
  }

  function getProduceCachedData(options: Value): boolean {
    if (!(options instanceof ObjectValue)) {
      return false;
    }

    let value = Get(realm, options, "produceCachedData");
    invariant(value instanceof ConcreteValue);
    return value instanceof BooleanValue && value.value;
  }

  function getLineOffsetArg(options: Value): number {
    const defaultLineOffset = 0;
    if (!(options instanceof ObjectValue)) {
      return defaultLineOffset;
    }
    let value = Get(realm, options, "lineOffset");
    invariant(value instanceof ConcreteValue);
    return value instanceof UndefinedValue ? defaultLineOffset : To.ToInteger(realm, value);
  }

  function getColumnOffsetArg(options: Value): number {
    const defaultColumnOffset = 0;
    if (!(options instanceof ObjectValue)) {
      return defaultColumnOffset;
    }
    let value = Get(realm, options, "columnOffset");
    invariant(value instanceof ConcreteValue);
    return value instanceof UndefinedValue ? defaultColumnOffset : To.ToInteger(realm, value);
  }

  function evalMachine(self: Value, timeout: number, displayErrors: boolean, breakOnSigint: boolean): Value {
    if (!(self instanceof ObjectValue) || !((self: any).$InternalSlot instanceof ContextifyScriptInternal)) {
      throw realm.createErrorThrowCompletion(
        realm.intrinsics.Error,
        "Script methods can only be called on script instances."
      );
    }
    let script = ((self: any).$InternalSlot: ContextifyScriptInternal);

    let environment = realm.$GlobalEnv;

    let previousContext = realm.getRunningContext();
    previousContext.suspend();

    let context = realm.createExecutionContext();
    context.lexicalEnvironment = environment;
    context.variableEnvironment = environment;
    context.realm = realm;

    realm.pushContext(context);

    let result;
    try {
      result = environment.evaluateCompletion(script.ast, false);
    } finally {
      context.suspend();
      realm.popContext(context);
      invariant(context.lexicalEnvironment === realm.$GlobalEnv);
      realm.onDestroyScope(context.lexicalEnvironment);
    }
    invariant(realm.getRunningContext() === previousContext);
    previousContext.resume();

    if (result instanceof EmptyValue) {
      return realm.intrinsics.undefined;
    } else if (result instanceof Value) {
      return result;
    } else {
      invariant(result instanceof AbruptCompletion);
      if (displayErrors) {
        decorateErrorStack(result);
      }
      throw result;
    }
  }

  let ContextifyScriptPrototype = new ObjectValue(
    realm,
    realm.intrinsics.ObjectPrototype,
    `${intrinsicName}.ContextifyScript.prototype`
  );

  ContextifyScriptPrototype.defineNativeMethod("runInContext", 2, runInContext);
  ContextifyScriptPrototype.defineNativeMethod("runInThisContext", 1, runInThisContext);

  Properties.DefinePropertyOrThrow(realm, ContextifyScript, "prototype", {
    value: ContextifyScriptPrototype,
    writable: true,
    enumerable: false,
    configurable: false,
  });

  Properties.DefinePropertyOrThrow(realm, ContextifyScriptPrototype, "constructor", {
    value: ContextifyScript,
    writable: true,
    enumerable: false,
    configurable: true,
  });

  return obj;
}
