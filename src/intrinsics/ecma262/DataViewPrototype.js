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
import { ObjectValue, StringValue, NumberValue } from "../../values/index.js";
import { IsDetachedBuffer } from "../../methods/is.js";
import { GetViewValue, SetViewValue } from "../../methods/arraybuffer.js";
import invariant from "../../invariant.js";

export default function(realm: Realm, obj: ObjectValue): void {
  // ECMA262 24.2.4.1
  obj.defineNativeGetter("buffer", context => {
    // 1. Let O be the this value.
    let O = context.throwIfNotConcrete();

    // 2. If Type(O) is not Object, throw a TypeError exception.
    if (!(O instanceof ObjectValue)) {
      throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError, "Type(O) is not Object");
    }

    // 3. If O does not have a [[DataView]] internal slot, throw a TypeError exception.
    if (!("$DataView" in O)) {
      throw realm.createErrorThrowCompletion(
        realm.intrinsics.TypeError,
        "O does not have a [[DataView]] internal slot"
      );
    }

    // 4. Assert: O has a [[ViewedArrayBuffer]] internal slot.
    invariant(O.$ViewedArrayBuffer);

    // 5. Let buffer be O.[[ViewedArrayBuffer]].
    let buffer = O.$ViewedArrayBuffer;

    // 6. Return buffer.
    return buffer;
  });

  // ECMA262 24.2.4.2
  obj.defineNativeGetter("byteLength", context => {
    // 1. Let O be the this value.
    let O = context.throwIfNotConcrete();

    // 2. If Type(O) is not Object, throw a TypeError exception.
    if (!(O instanceof ObjectValue)) {
      throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError, "Type(O) is not Object");
    }

    // 3. If O does not have a [[DataView]] internal slot, throw a TypeError exception.
    if (!("$DataView" in O)) {
      throw realm.createErrorThrowCompletion(
        realm.intrinsics.TypeError,
        "O does not have a [[DataView]] internal slot"
      );
    }

    // 4. Assert: O has a [[ViewedArrayBuffer]] internal slot.
    invariant(O.$ViewedArrayBuffer);

    // 5. Let buffer be O.[[ViewedArrayBuffer]].
    let buffer = O.$ViewedArrayBuffer;

    // 6. If IsDetachedBuffer(buffer) is true, throw a TypeError exception.
    if (IsDetachedBuffer(realm, buffer) === true) {
      throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError, "IsDetachedBuffer(buffer) is true");
    }

    // 7. Let size be O.[[ByteLength]].
    let size = O.$ByteLength;
    invariant(typeof size === "number");

    // 8. Return size.
    return new NumberValue(realm, size);
  });

  // ECMA262 24.2.4.3
  obj.defineNativeGetter("byteOffset", context => {
    // 1. Let O be the this value.
    let O = context.throwIfNotConcrete();

    // 2. If Type(O) is not Object, throw a TypeError exception.
    if (!(O instanceof ObjectValue)) {
      throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError, "Type(O) is not Object");
    }

    // 3. If O does not have a [[DataView]] internal slot, throw a TypeError exception.
    if (!("$DataView" in O)) {
      throw realm.createErrorThrowCompletion(
        realm.intrinsics.TypeError,
        "O does not have a [[DataView]] internal slot"
      );
    }

    // 4. Assert: O has a [[ViewedArrayBuffer]] internal slot.
    invariant(O.$ViewedArrayBuffer);

    // 5. Let buffer be O.[[ViewedArrayBuffer]].
    let buffer = O.$ViewedArrayBuffer;

    // 6. If IsDetachedBuffer(buffer) is true, throw a TypeError exception.
    if (IsDetachedBuffer(realm, buffer) === true) {
      throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError, "IsDetachedBuffer(buffer) is true");
    }

    // 7. Let offset be O.[[ByteOffset]].
    let offset = O.$ByteOffset;
    invariant(typeof offset === "number");

    // 8. Return offset.
    return new NumberValue(realm, offset);
  });

  // ECMA262 24.2.4.5
  obj.defineNativeMethod("getFloat32", 1, (context, [byteOffset, _littleEndian]) => {
    let littleEndian = _littleEndian;
    // 1. Let v be the this value.
    let v = context;

    // 2. If littleEndian is not present, let littleEndian be false.
    if (!littleEndian) littleEndian = realm.intrinsics.false;

    // 3. Return ? GetViewValue(v, byteOffset, littleEndian, "Float32").
    return GetViewValue(realm, v, byteOffset, littleEndian, "Float32");
  });

  // ECMA262 24.2.4.6
  obj.defineNativeMethod("getFloat64", 1, (context, [byteOffset, _littleEndian]) => {
    let littleEndian = _littleEndian;
    // 1. Let v be the this value.
    let v = context;

    // 2. If littleEndian is not present, let littleEndian be false.
    if (!littleEndian) littleEndian = realm.intrinsics.false;

    // 3. Return ? GetViewValue(v, byteOffset, littleEndian, "Float64").
    return GetViewValue(realm, v, byteOffset, littleEndian, "Float64");
  });

  // ECMA262 24.2.4.7
  obj.defineNativeMethod("getInt8", 1, (context, [byteOffset]) => {
    // 1. Let v be the this value.
    let v = context;

    // 2. Return ? GetViewValue(v, byteOffset, true, "Int8").
    return GetViewValue(realm, v, byteOffset, realm.intrinsics.true, "Int8");
  });

  // ECMA262 24.2.4.8
  obj.defineNativeMethod("getInt16", 1, (context, [byteOffset, _littleEndian]) => {
    let littleEndian = _littleEndian;
    // 1. Let v be the this value.
    let v = context;

    // 2. If littleEndian is not present, let littleEndian be false.
    if (!littleEndian) littleEndian = realm.intrinsics.false;

    // 3. Return ? GetViewValue(v, byteOffset, littleEndian, "Int16").
    return GetViewValue(realm, v, byteOffset, littleEndian, "Int16");
  });

  // ECMA262 24.2.4.9
  obj.defineNativeMethod("getInt32", 1, (context, [byteOffset, _littleEndian]) => {
    let littleEndian = _littleEndian;
    // 1. Let v be the this value.
    let v = context;

    // 2. If littleEndian is not present, let littleEndian be false.
    if (!littleEndian) littleEndian = realm.intrinsics.false;

    // 3. Return ? GetViewValue(v, byteOffset, littleEndian, "Int32").
    return GetViewValue(realm, v, byteOffset, littleEndian, "Int32");
  });

  // ECMA262 24.2.4.10
  obj.defineNativeMethod("getUint8", 1, (context, [byteOffset]) => {
    // 1. Let v be the this value.
    let v = context;

    // 2. Return ? GetViewValue(v, byteOffset, true, "Uint8").
    return GetViewValue(realm, v, byteOffset, realm.intrinsics.true, "Uint8");
  });

  // ECMA262 24.2.4.11
  obj.defineNativeMethod("getUint16", 1, (context, [byteOffset, _littleEndian]) => {
    let littleEndian = _littleEndian;
    // 1. Let v be the this value.
    let v = context;

    // 2. If littleEndian is not present, let littleEndian be false.
    if (!littleEndian) littleEndian = realm.intrinsics.false;

    // 3. Return ? GetViewValue(v, byteOffset, littleEndian, "Uint16").
    return GetViewValue(realm, v, byteOffset, littleEndian, "Uint16");
  });

  // ECMA262 24.2.4.12
  obj.defineNativeMethod("getUint32", 1, (context, [byteOffset, _littleEndian]) => {
    let littleEndian = _littleEndian;
    // 1. Let v be the this value.
    let v = context;

    // 2. If littleEndian is not present, let littleEndian be false.
    if (!littleEndian) littleEndian = realm.intrinsics.false;

    // 3. Return ? GetViewValue(v, byteOffset, littleEndian, "Uint32").
    return GetViewValue(realm, v, byteOffset, littleEndian, "Uint32");
  });

  // ECMA262 24.2.4.13
  obj.defineNativeMethod("setFloat32", 2, (context, [byteOffset, value, _littleEndian]) => {
    let littleEndian = _littleEndian;
    // 1. Let v be the this value.
    let v = context;

    // 2. If littleEndian is not present, let littleEndian be false.
    if (!littleEndian) littleEndian = realm.intrinsics.false;

    // 3. Return ? SetViewValue(v, byteOffset, littleEndian, "Float32", value).
    return SetViewValue(realm, v, byteOffset, littleEndian, "Float32", value);
  });

  // ECMA262 24.2.4.14
  obj.defineNativeMethod("setFloat64", 2, (context, [byteOffset, value, _littleEndian]) => {
    let littleEndian = _littleEndian;
    // 1. Let v be the this value.
    let v = context;

    // 2. If littleEndian is not present, let littleEndian be false.
    if (!littleEndian) littleEndian = realm.intrinsics.false;

    // 3. Return ? SetViewValue(v, byteOffset, littleEndian, "Float64", value).
    return SetViewValue(realm, v, byteOffset, littleEndian, "Float64", value);
  });

  // ECMA262 24.2.4.15
  obj.defineNativeMethod("setInt8", 2, (context, [byteOffset, value]) => {
    // 1. Let v be the this value.
    let v = context;

    // 2. Return ? SetViewValue(v, byteOffset, true, "Int8", value).
    return SetViewValue(realm, v, byteOffset, realm.intrinsics.true, "Int8", value);
  });

  // ECMA262 24.2.4.16
  obj.defineNativeMethod("setInt16", 2, (context, [byteOffset, value, _littleEndian]) => {
    let littleEndian = _littleEndian;
    // 1. Let v be the this value.
    let v = context;

    // 2. If littleEndian is not present, let littleEndian be false.
    if (!littleEndian) littleEndian = realm.intrinsics.false;

    // 3. Return ? SetViewValue(v, byteOffset, littleEndian, "Int16", value).
    return SetViewValue(realm, v, byteOffset, littleEndian, "Int16", value);
  });

  // ECMA262 24.2.4.17
  obj.defineNativeMethod("setInt32", 2, (context, [byteOffset, value, _littleEndian]) => {
    let littleEndian = _littleEndian;
    // 1. Let v be the this value.
    let v = context;

    // 2. If littleEndian is not present, let littleEndian be false.
    if (!littleEndian) littleEndian = realm.intrinsics.false;

    // 3. Return ? SetViewValue(v, byteOffset, littleEndian, "Int32", value).
    return SetViewValue(realm, v, byteOffset, littleEndian, "Int32", value);
  });

  // ECMA262 24.2.4.18
  obj.defineNativeMethod("setUint8", 2, (context, [byteOffset, value]) => {
    // 1. Let v be the this value.
    let v = context;

    // 2. Return ? SetViewValue(v, byteOffset, true, "Uint8", value).
    return SetViewValue(realm, v, byteOffset, realm.intrinsics.true, "Uint8", value);
  });

  // ECMA262 24.2.4.19
  obj.defineNativeMethod("setUint16", 2, (context, [byteOffset, value, _littleEndian]) => {
    let littleEndian = _littleEndian;
    // 1. Let v be the this value.
    let v = context;

    // 2. If littleEndian is not present, let littleEndian be false.
    if (!littleEndian) littleEndian = realm.intrinsics.false;

    // 3. Return ? SetViewValue(v, byteOffset, littleEndian, "Uint16", value).
    return SetViewValue(realm, v, byteOffset, littleEndian, "Uint16", value);
  });

  // ECMA262 24.2.4.20
  obj.defineNativeMethod("setUint32", 2, (context, [byteOffset, value, _littleEndian]) => {
    let littleEndian = _littleEndian;
    // 1. Let v be the this value.
    let v = context;

    // 2. If littleEndian is not present, let littleEndian be false.
    if (!littleEndian) littleEndian = realm.intrinsics.false;

    // 3. Return ? SetViewValue(v, byteOffset, littleEndian, "Uint32", value).
    return SetViewValue(realm, v, byteOffset, littleEndian, "Uint32", value);
  });

  // ECMA26224.2.4.21
  obj.defineNativeProperty(realm.intrinsics.SymbolToStringTag, new StringValue(realm, "DataView"), { writable: false });
}
