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
import { NumberValue, NativeFunctionValue, ObjectValue, StringValue } from "../../values/index.js";
import { Set, ToInteger } from "../../methods/index.js";
import { getNodeBufferFromTypedArray } from "./utils.js";

declare var process: any;

export default function(realm: Realm): ObjectValue {
  let nativeBuffer = process.binding("buffer");
  let nativeBufferPrototype = (require("buffer"): any).Buffer.prototype;

  let intrinsicName = 'process.binding("buffer")';
  let obj = new ObjectValue(realm, realm.intrinsics.ObjectPrototype, intrinsicName);

  // Buffer

  let setupBufferJS = new NativeFunctionValue(
    realm,
    intrinsicName + ".setupBufferJS",
    "setupBufferJS",
    0,
    (setupContext, setupArgs) => {
      invariant(setupArgs.length === 2);
      invariant(setupArgs[0] instanceof ObjectValue);
      invariant(setupArgs[1] instanceof ObjectValue);
      // TODO: Mutate the second argument by setting one of the properties to
      // Buffer prototype just like the native implementation does.
      let [proto] = setupArgs;

      let simpleWrapperNames = [
        "asciiSlice",
        "base64Slice",
        "latin1Slice",
        "hexSlice",
        "ucs2Slice",
        "asciiWrite",
        "base64Write",
        "latin1Write",
        "hexWrite",
        "ucs2Write",
        "utf8Write",
      ];

      for (let name of simpleWrapperNames) {
        let wrapper = new NativeFunctionValue(realm, "Buffer.prototype." + name, name, 0, (context, args) => {
          throw new Error("TODO: " + name);
        });
        Set(realm, proto, name, wrapper, true);
      }

      // utf8Slice is used to read source code.
      let utf8Slice = new NativeFunctionValue(realm, "Buffer.prototype.utf8Slice", "utf8Slice", 0, (context, args) => {
        invariant(context instanceof ObjectValue);
        let self = getNodeBufferFromTypedArray(realm, context);
        let decodedArgs = args.map((arg, i) => ToInteger(realm, arg));
        let utf8String = nativeBufferPrototype.utf8Slice.apply(self, decodedArgs);
        return new StringValue(realm, utf8String);
      });
      Set(realm, proto, "utf8Slice", utf8Slice, true);

      // copy has recently moved from the prototype to the instance upstream.
      let copy = new NativeFunctionValue(realm, "Buffer.prototype.copy", "copy", 0, (context, args) => {
        invariant(context instanceof ObjectValue);
        let self = getNodeBufferFromTypedArray(realm, context);
        let decodedArgs = args.map((arg, i) => {
          if (i === 0) {
            invariant(arg instanceof ObjectValue);
            return getNodeBufferFromTypedArray(realm, arg);
          } else {
            return ToInteger(realm, arg);
          }
        });
        let bytesCopied = nativeBufferPrototype.copy.apply(self, decodedArgs);
        return new NumberValue(realm, bytesCopied);
      });
      Set(realm, proto, "copy", copy, true);

      // TODO: Set up more methods on the prototype and bindingObject
      return realm.intrinsics.undefined;
    }
  );
  Set(realm, obj, "setupBufferJS", setupBufferJS, true);

  let createFromString = new NativeFunctionValue(
    realm,
    intrinsicName + ".createFromString",
    "createFromString",
    0,
    (context, args) => {
      throw new Error("TODO");
    }
  );
  Set(realm, obj, "createFromString", createFromString, true);

  let simpleWrapperNames = [
    "byteLengthUtf8",
    "copy",
    "compare",
    "compareOffset",
    "fill",
    "indexOfBuffer",
    "indexOfNumber",
    "indexOfString",

    "readDoubleBE",
    "readDoubleLE",
    "readFloatBE",
    "readFloatLE",

    "writeDoubleBE",
    "writeDoubleLE",
    "writeFloatBE",
    "writeFloatLE",

    "swap16",
    "swap32",
    "swap64",
  ];

  for (let name of simpleWrapperNames) {
    let wrapper = new NativeFunctionValue(realm, intrinsicName + "." + name, name, 0, (context, args) => {
      throw new Error("TODO");
    });
    Set(realm, obj, name, wrapper, true);
  }

  Set(realm, obj, "kMaxLength", new NumberValue(realm, nativeBuffer.kMaxLength), true);
  Set(realm, obj, "kStringMaxLength", new NumberValue(realm, nativeBuffer.kStringMaxLength), true);

  return obj;
}
