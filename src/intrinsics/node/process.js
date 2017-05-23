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
import type { Realm } from "../../realm.js";
import { ConcreteValue, ArrayValue, ObjectValue, BooleanValue, NumberValue, StringValue, FunctionValue, NativeFunctionValue } from "../../values/index.js";
import { Get, DefinePropertyOrThrow, OrdinaryDelete, OrdinaryDefineOwnProperty, ToString, ToInteger, ToBoolean } from "../../methods/index.js";
import { TypesDomain, ValuesDomain } from "../../domains/index.js";
import buildExpressionTemplate from "../../utils/builder.js";
import initializeBuffer from "./buffer.js";
import initializeContextify from "./contextify.js";
import initializeFS from "./fs.js";
import { copyProperty, createDeepIntrinsic } from "./utils.js";

declare var process: any;

function initializeTimerWrap(realm) {
  let obj = new ObjectValue(realm, realm.intrinsics.ObjectPrototype, "process.binding('timer_wrap')");
  let constructor = new NativeFunctionValue(realm, "process.binding('timer_wrap').Timer", "Timer", 0, (context, args) => {
    return realm.intrinsics.undefined;
  });
  OrdinaryDefineOwnProperty(realm, obj, "Timer", {
    value: constructor,
    writable: true,
    enumerable: true,
    configurable: true
  });
  // TODO: Implement the rest of this protocol as needed.
  return obj;
}

function initializeTTYWrap(realm) {
  let nativeTTYWrap = process.binding("tty_wrap");
  // let nativeTTY = nativeTTYWrap.TTY;
  let obj = new ObjectValue(realm, realm.intrinsics.ObjectPrototype, "process.binding('tty_wrap')");

  let constructor = new NativeFunctionValue(realm, "process.binding('tty_wrap').TTY", "TTY", 0, (context, args, argCount, NewTarget) => {
    invariant(args[0] instanceof ConcreteValue);
    let fd = ToInteger(realm, args[0]);
    invariant(args[1] instanceof ConcreteValue);
    let value = ToBoolean(realm, args[1]);

    invariant(NewTarget, "TTY must be called as a constructor.");

    let proto = Get(realm, NewTarget, new StringValue(realm, "prototype"));
    if (!(proto instanceof ObjectValue)) {
      proto = TTYPrototype;
    }

    // TODO: Store nativeTTY in an internal slot so that it can be used if this
    // object gets passed to another native call.

    return new ObjectValue(
      realm,
      proto,
      `new (process.binding('tty_wrap').TTY)(${fd}, ${value.toString()})`
    );
  });
  OrdinaryDefineOwnProperty(realm, obj, "TTY", {
    value: constructor,
    writable: true,
    enumerable: true,
    configurable: true
  });

  let TTYPrototype = new ObjectValue(realm, realm.intrinsics.ObjectPrototype, "process.binding('tty_wrap').TTY.prototype");

  TTYPrototype.defineNativeMethod("setBlocking", 0, (context, args) => {
    return realm.intrinsics.undefined;
  });
  TTYPrototype.defineNativeMethod("getWindowSize", 0, (context, args) => {
    return realm.intrinsics.undefined;
  });
  TTYPrototype.defineNativeMethod("writeUtf8String", 0, (context, args) => {
    // TODO: Store this as a side-effect. When we do that, we need the first arg
    // to be passed along to that side-effect.
    // let req = args[0];
    let content = args[1];
    invariant(content instanceof StringValue);
    return realm.intrinsics.undefined;
  });

  DefinePropertyOrThrow(realm, constructor, "prototype", {
    value: TTYPrototype,
    writable: true,
    enumerable: false,
    configurable: false
  });

  obj.defineNativeMethod("guessHandleType", 0, (context, args) => {
    let fd = ToInteger(realm, args[0]);
    return new StringValue(realm, nativeTTYWrap.guessHandleType(fd));
    // TODO: Make this abstract so that changing the pipe at runtime is
    // possible. Currently this causes an introspection error.

    // let types = new TypesDomain(StringValue);
    // let values = new ValuesDomain(new Set([
    //   new StringValue(realm, "TCP"),
    //   new StringValue(realm, "TTY"),
    //   new StringValue(realm, "UDP"),
    //   new StringValue(realm, "FILE"),
    //   new StringValue(realm, "PIPE"),
    //   new StringValue(realm, "UNKNOWN")
    // ]));
    // let buildNode = buildExpressionTemplate(
    //   `(process.binding('tty_wrap').guessHandleType(${fd}))`
    // );
    // return realm.createAbstract(types, values, [], buildNode, undefined, `(process.binding('tty_wrap').guessHandleType(${fd}))`);
  });
  obj.defineNativeMethod("isTTY", 0, (context, args) => {
    let fd = ToInteger(realm, args[0]);
    let types = new TypesDomain(BooleanValue);
    let values = new ValuesDomain(new Set([
      realm.intrinsics.true,
      realm.intrinsics.false
    ]));
    let buildNode = buildExpressionTemplate(
      `(process.binding('tty_wrap').isTTY(${fd}))`
    );
    return realm.createAbstract(types, values, [], buildNode, undefined, `(process.binding('tty_wrap').isTTY(${fd}))`);
  });
  // TODO: Implement the rest of this protocol.
  return obj;
}

function initializeSignalWrap(realm) {
  // TODO: Implement more of this protocol. When doing so, we'll likely need to
  // forward it to the native implementation.
  // let nativeSignalWrap = process.binding("signal_wrap");
  let obj = new ObjectValue(realm, realm.intrinsics.ObjectPrototype, "process.binding('signal_wrap')");

  let constructor = new NativeFunctionValue(realm, "process.binding('signal_wrap').Signal", "Signal", 0, (context, args) => {
    return realm.intrinsics.undefined;
  });
  OrdinaryDefineOwnProperty(realm, obj, "Signal", {
    value: constructor,
    writable: true,
    enumerable: true,
    configurable: true
  });

  let SignalPrototype = new ObjectValue(realm, realm.intrinsics.ObjectPrototype, "process.binding('signal_wrap').Signal.prototype");
  SignalPrototype.defineNativeMethod("unref", 0, (context, args) => {
    // TODO: Track the side-effect of this.
    return realm.intrinsics.undefined;
  });
  SignalPrototype.defineNativeMethod("start", 0, (context, args) => {
    // TODO: Track the side-effect of this.
    return realm.intrinsics.undefined;
  });
  SignalPrototype.defineNativeMethod("close", 0, (context, args) => {
    // TODO: Track the side-effect of this.
    return realm.intrinsics.undefined;
  });

  DefinePropertyOrThrow(realm, constructor, "prototype", {
    value: SignalPrototype,
    writable: true,
    enumerable: false,
    configurable: false
  });

  // TODO
  return obj;
}

function initializeStreamWrap(realm) {
  // let nativeStreamWrap = process.binding("stream_wrap");
  let obj = new ObjectValue(realm, realm.intrinsics.ObjectPrototype, "process.binding('stream_wrap')");

  let constructor = new NativeFunctionValue(realm, "process.binding('stream_wrap').WriteWrap", "WriteWrap", 0, (context, args) => {
    return realm.intrinsics.undefined;
  });
  OrdinaryDefineOwnProperty(realm, obj, "WriteWrap", {
    value: constructor,
    writable: true,
    enumerable: true,
    configurable: true
  });

  let WriteWrapPrototype = new ObjectValue(realm, realm.intrinsics.ObjectPrototype, "process.binding('stream_wrap').WriteWrap.prototype");
  WriteWrapPrototype.defineNativeMethod("unref", 0, (context, args) => {
    // TODO: Track the side-effect of this.
    return realm.intrinsics.undefined;
  });

  DefinePropertyOrThrow(realm, constructor, "prototype", {
    value: WriteWrapPrototype,
    writable: true,
    enumerable: false,
    configurable: false
  });

  let ShutdownWrap = createAbstractValue(realm, FunctionValue, "process.binding('stream_wrap').ShutdownWrap", {});
  DefinePropertyOrThrow(realm, obj, "ShutdownWrap", {
    value: ShutdownWrap,
    writable: true,
    configurable: true,
    enumerable: true,
  });

  // TODO
  return obj;
}

function initializeFSEvent(realm) {
  let obj = new ObjectValue(realm, realm.intrinsics.ObjectPrototype, "process.binding('fs_event_wrap')");
  let FSEvent = createAbstractValue(realm, FunctionValue, "process.binding('fs_event_wrap').FSEvent", {});
  DefinePropertyOrThrow(realm, obj, "FSEvent", {
    value: FSEvent,
    writable: true,
    configurable: true,
    enumerable: true,
  });

  // TODO
  return obj;
}

function initializeURL(realm) {
  let obj = new ObjectValue(realm, realm.intrinsics.ObjectPrototype);
  // TODO
  return obj;
}

function initializeUtil(realm) {
  let obj = new ObjectValue(realm, realm.intrinsics.ObjectPrototype, 'process.binding("util")');
  obj.defineNativeMethod("isUint8Array", 0, (context, args) => {
    let arr = args[0];
    if (arr instanceof ObjectValue && arr.$TypedArrayName === 'Uint8Array') {
      return realm.intrinsics.true;
    }
    return realm.intrinsics.false;
  });
  copyProperty(realm, process.binding("util"), obj, "pushValToArrayMax", new NumberValue(realm, process.binding('util').pushValToArrayMax, 'process.binding("util").pushValToArrayMax'));
  // TODO
  return obj;
}

function createAbstractValue(realm, type, intrinsicName) {
  let types = new TypesDomain(type);
  let values = type === ObjectValue ? new ValuesDomain(new Set([new ObjectValue(realm)])) : ValuesDomain.topVal;
  let buildNode = buildExpressionTemplate(intrinsicName);
  return realm.createAbstract(types, values, [], buildNode, undefined, intrinsicName);
}

function createIntrinsicArrayValue(realm, intrinsicName) {
  // Like ArrayCreate but accepts an intrinsic name.
  let obj = new ArrayValue(realm, intrinsicName);
  obj.setExtensible(true);
  OrdinaryDefineOwnProperty(realm, obj, "length", {
    value: realm.intrinsics.zero,
    writable: true,
    enumerable: false,
    configurable: false
  });
  return obj;
}

function reverseConfigJSON(config) {
  // Hack to restore the gyp config format
  let json = JSON.stringify(process.config).replace(/"/g, "'");
  return '\n' + json;
}

export default function (realm: Realm, processArgv: Array<string>): ObjectValue {
  if (!realm.useAbstractInterpretation) {
    throw new Error('Realm is not partial');
  }
  // TODO: This causes a dependency on the native `process` which doesn't
  // exist in all environments such as the webpack version.

  // Constant bindings
  // TODO: Implement icu module so that we can let hasIntl be true.
  let configOverride = { ...process.binding("config"), hasIntl: false };
  // By the time we run the host has already deleted natives.config so we have
  // to restore it.
  let nativeOverride = { ...process.binding("natives"), config: reverseConfigJSON(process.config) };
  let config = createDeepIntrinsic(realm, configOverride, 'process.binding("config")');
  let constants = createDeepIntrinsic(realm, process.binding("constants"), 'process.binding("constants")');
  let natives = createDeepIntrinsic(realm, nativeOverride, 'process.binding("natives")');

  // Built-in native bindings
  let contextify = initializeContextify(realm);
  let fs = initializeFS(realm);
  let fsEvent = initializeFSEvent(realm);
  let url = initializeURL(realm);
  let timerWrap = initializeTimerWrap(realm);
  let ttyWrap = initializeTTYWrap(realm);
  let signalWrap = initializeSignalWrap(realm);
  let streamWrap = initializeStreamWrap(realm);
  let caresWrap = createAbstractValue(realm, ObjectValue, 'process.binding("cares_wrap")');
  let tcpWrap = createAbstractValue(realm, ObjectValue, 'process.binding("tcp_wrap")');
  tcpWrap.makeSimple();
  let pipeWrap = createAbstractValue(realm, ObjectValue, 'process.binding("pipe_wrap")');
  pipeWrap.makeSimple();
  let uv = createAbstractValue(realm, ObjectValue, 'process.binding("uv")');
  let buffer = initializeBuffer(realm);
  let util = initializeUtil(realm);
  let os = createAbstractValue(realm, ObjectValue, 'process.binding("os")');
  os.makeSimple();

  // List of loaded native modules
  let moduleLoadList = createIntrinsicArrayValue(realm, "process.moduleLoadList");

  // The process object
  let obj = new ObjectValue(realm, realm.intrinsics.ObjectPrototype, "process");
  obj.defineNativeMethod("binding", 1, (context, args) => {
    let arg0 = args.length < 1 ? realm.intrinsics.undefined : args[0];
    let module = ToString(realm, arg0);
    // TODO: Add the module to the moduleLoadList but don't track that
    // as a side-effect.
    switch (module) {
      // Constants
      case "config":
        return config;
      case "constants":
        return constants;
      case "natives":
        return natives;

      // Built-in bindings
      case "contextify":
        return contextify;
      case "fs":
        return fs;
      case "fs_event_wrap":
        return fsEvent;
      case "url":
        return url;
      case "uv":
        return uv;
      case "buffer":
        return buffer;
      case "util":
        return util;
      case "os":
        return os;
      case "timer_wrap":
        return timerWrap;
      case "tty_wrap":
        return ttyWrap;
      case "cares_wrap":
        return caresWrap;
      case "tcp_wrap":
        return tcpWrap;
      case "pipe_wrap":
        return pipeWrap;
      case "stream_wrap":
        return streamWrap;
      case "signal_wrap":
        return signalWrap;

      default:
        throw realm.createErrorThrowCompletion(
          realm.intrinsics.TypeError,
          `No such module: ${module}`
        );
    }
  });

  copyProperty(realm, process, obj, "moduleLoadList", moduleLoadList);

  // Constants on the process
  let constantNames = [
    "version",
    "versions",
    "_promiseRejectEvent",
    "arch",
    "platform",
    "release",
    "features",
    "_needImmediateCallback",
  ];
  for (let name of constantNames) {
    let value = createDeepIntrinsic(realm, process[name], "process." + name);
    copyProperty(realm, process, obj, name, value);
  }

  // process._events is a mutable object with null prototype.
  let _events = new ObjectValue(realm, realm.intrinsics.null, "process._events");
  copyProperty(realm, process, obj, "_events", _events);

  // TODO: When abstract numbers in string templates is implemented, turn this
  // back into an abstract value.
  // let pid = createAbstractValue(realm, NumberValue, "process.pid");
  let pid = new NumberValue(realm, 0, "process.pid");
  copyProperty(realm, process, obj, "pid", pid);
  let debugPort = createAbstractValue(realm, NumberValue, "process.debugPort");
  copyProperty(realm, process, obj, "debugPort", debugPort);
  let title = createAbstractValue(realm, StringValue, "process.title");
  copyProperty(realm, process, obj, "title", title);

  // process.execArgv should probably be passed as an argument to the compile
  // step rather than letting arbitrary options be passed to the program.
  // For now I'll just hard code it as empty array.
  // TODO: Allow execArgv to be passed as a compiler option.
  let execArgv = createIntrinsicArrayValue(realm, "process.execArgv");
  copyProperty(realm, process, obj, "execArgv", execArgv);

  let cwd = new NativeFunctionValue(realm, "process.cwd", "cwd", 0, (context, args) => {
    return new StringValue(realm, process.cwd(), "process.cwd()");
  });
  copyProperty(realm, process, obj, "cwd", cwd);

  // These properties all depend on options being defined in "execArgv" but
  // since we hard coded it, none of this will be added.
  // "_eval" : string
  // "_print_eval" : boolean
  // "_syntax_check_only" : boolean
  // "_forceRepl" : boolean
  // "noDeprecation" : boolean
  // "noProcessWarnings" : boolean
  // "traceProcessWarnings" : boolean
  // "throwDeprecation" : boolean
  // "_noBrowserGlobals" : boolean
  // "profProcess" : boolean
  // "traceDeprecation" : boolean
  // "_debugWaitConnect" : boolean

  // "_preload_modules" gets looped over so it needs to be known but typically
  // we don't need to do this so we can just leave it not defined.

  // Side-effectful Methods

  let methodNames = [
    "_startProfilerIdleNotifier",
    "_stopProfilerIdleNotifier",
    "_getActiveRequests",
    "_getActiveHandles",
    "reallyExit",
    "abort",
    "chdir",
    "umask",

    // Start Posix only
    "getuid",
    "geteuid",
    "setuid",
    "seteuid",

    "setgid",
    "setegid",
    "getgid",
    "getegid",

    "getgroups",
    "setgroups",
    "initgroups",
    // End Posix only

    "_kill",

    "_debugProcess",
    "_debugPause",
    "_debugEnd",

    "hrtime",

    "cpuUsage",

    "dlopen",

    "uptime",
    "memoryUsage",

    "_linkedBinding",

    "_setupNextTick",
    "_setupPromises",
    "_setupDomainUse",
  ];

  for (let name of methodNames) {
    let abstractMethod = createAbstractValue(realm, FunctionValue, "process." + name);
    copyProperty(realm, process, obj, name, abstractMethod);
  }

  let argv0 = new StringValue(realm, process.argv0, "process.argv0");
  DefinePropertyOrThrow(realm, obj, "argv0", {
    value: argv0,
    writable: false,
    configurable: true,
    enumerable: true,
  });

  let argv = createAbstractValue(realm, ObjectValue, "process.argv", {});

  DefinePropertyOrThrow(realm, argv, "0", {
    value: argv0,
    writable: true,
    configurable: true,
    enumerable: true,
  });

  DefinePropertyOrThrow(realm, argv, "1", {
    value: new StringValue(realm, processArgv[1]),
    writable: true,
    configurable: true,
    enumerable: true,
  });

  DefinePropertyOrThrow(realm, argv, "indexOf", {
    value: new NativeFunctionValue(realm, "process.argv.indexOf", "indexOf", 0, (context, args) => {
      return realm.intrinsics.false;
    }),
    writable: true,
    configurable: true,
    enumerable: true,
  });

  argv.makeSimple();
  copyProperty(realm, process, obj, "argv", argv);

  let execPath = new StringValue(realm, process.execPath, "process.execPath");
  copyProperty(realm, process, obj, "execPath", execPath);

  let env = new ObjectValue(realm, realm.intrinsics.ObjectPrototype, "process.env");
  // TODO: This abstract value doesn't work with a conditional for some reason.
  DefinePropertyOrThrow(realm, env, "NODE_NO_WARNINGS", {
    value: new StringValue(
      realm, "0", "process.env.NODE_NO_WARNINGS"
    ),
    writable: true,
    configurable: true,
    enumerable: true,
  });

  // Uncomment this to debug the module resolution system.
  // DefinePropertyOrThrow(realm, env, "NODE_DEBUG", {
  //   value: new StringValue(
  //     realm, "module", "process.env.NODE_DEBUG"
  //   ),
  //   writable: true,
  //   configurable: true,
  //   enumerable: true,
  // });
  env.makeSimple();
  copyProperty(realm, process, obj, "env", env);

  // This method just gets passed a value from the initialization code and
  // then deletes itself.
  // TODO: The generated code needs to either always invoke this (make it
  // abstract) or, if we assume it has been done, it doesn't need to delete it.
  obj.defineNativeMethod("_setupProcessObject", 1, (self, [pushValueToArray]) => {
    OrdinaryDelete(realm, obj, "_setupProcessObject");
    return realm.intrinsics.undefined;
  });

  // This method injects a generic global promise reject callback. In real
  // environment we'd want to call this at rejections but we can safely skip it.
  obj.defineNativeMethod("_setupPromises", 1, (self, [promiseRejectCallback]) => {
    OrdinaryDelete(realm, obj, "_setupPromises");
    return realm.intrinsics.undefined;
  });

  // TODO: Support Promises. Set up a micro task runner and invoke the
  // tickCallback as needed.
  obj.defineNativeMethod("_setupNextTick", 1, (self, [tickCallback, runMicrotasks]) => {
    OrdinaryDelete(realm, obj, "_setupNextTick");
    let runMicrotasksCallback = new NativeFunctionValue(realm, "(function() { throw new Error('TODO runMicrotasks not reachable') })", "runMicrotasks", 0, (context, args) => {
      // TODO: Implement Promises and micro tasks.
      return realm.intrinsics.undefined;
    });
    OrdinaryDefineOwnProperty(realm, runMicrotasks, "runMicrotasks", {
      value: runMicrotasksCallback,
      writable: true,
      enumerable: true,
      configurable: true
    });
    let tickInfo = new ObjectValue(
      realm,
      realm.intrinsics.ObjectPrototype,
      "(function() { throw new Error('TODO tickInfo is not reachable in the host environment') })"
    );
    OrdinaryDefineOwnProperty(realm, tickInfo, "0", {
      value: realm.intrinsics.zero,
      writable: true,
      enumerable: true,
      configurable: true
    });
    OrdinaryDefineOwnProperty(realm, tickInfo, "1", {
      value: realm.intrinsics.zero,
      writable: true,
      enumerable: true,
      configurable: true
    });
    return tickInfo;
  });

  return obj;
}
