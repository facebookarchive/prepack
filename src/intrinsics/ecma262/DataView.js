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
import {
  ToIndexPartial,
  OrdinaryCreateFromConstructor,
  IsDetachedBuffer,
} from "../../methods/index.js";
import { NativeFunctionValue, ObjectValue, UndefinedValue } from "../../values/index.js";
import invariant from "../../invariant.js";

export default function (realm: Realm): NativeFunctionValue {
  // ECMA262 24.2.2.1
  let func = new NativeFunctionValue(realm, "DataView", "DataView", 3, (context, [buffer, byteOffset, byteLength], argCount, NewTarget) => {
    // 1. If NewTarget is undefined, throw a TypeError exception.
    if (!NewTarget) {
      throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError);
    }

    buffer = buffer.throwIfNotConcrete();
    // 2. If Type(buffer) is not Object, throw a TypeError exception.
    if (!(buffer instanceof ObjectValue)) {
      throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError);
    }

    // 3. If buffer does not have an [[ArrayBufferData]] internal slot, throw a TypeError exception.
    if (!('$ArrayBufferData' in buffer)) {
      throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError);
    }

    // 4. Let offset be ? ToIndex(byteOffset).
    let offset = ToIndexPartial(realm, byteOffset);

    // 5. If IsDetachedBuffer(buffer) is true, throw a TypeError exception.
    if (IsDetachedBuffer(realm, buffer)) {
      throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError);
    }

    // 6. Let bufferByteLength be the value of buffer's [[ArrayBufferByteLength]] internal slot.
    let bufferByteLength = buffer.$ArrayBufferByteLength;
    invariant(typeof bufferByteLength === "number");

    // 7. If offset > bufferByteLength, throw a RangeError exception.
    if (offset > bufferByteLength) {
      throw realm.createErrorThrowCompletion(realm.intrinsics.RangeError);
    }

    // 8. If byteLength is undefined, then
    let viewByteLength;
    if (!byteLength || byteLength instanceof UndefinedValue) {
      // a. Let viewByteLength be bufferByteLength - offset.
      viewByteLength = bufferByteLength - offset;
    } else { // 9. Else,
      // a. Let viewByteLength be ? ToIndex(byteLength).
      viewByteLength = ToIndexPartial(realm, byteLength);

      // b. If offset+viewByteLength > bufferByteLength, throw a RangeError exception.
      if (offset + viewByteLength > bufferByteLength) {
        throw realm.createErrorThrowCompletion(realm.intrinsics.RangeError);
      }
    }

    // 10. Let O be ? OrdinaryCreateFromConstructor(NewTarget, "%DataViewPrototype%", « [[DataView]], [[ViewedArrayBuffer]], [[ByteLength]], [[ByteOffset]] »).
    let O = OrdinaryCreateFromConstructor(realm, NewTarget, "DataViewPrototype", {
      $DataView: undefined,
      $ViewedArrayBuffer: undefined,
      $ByteLength: undefined,
      $ByteOffset: undefined
    });

    // 11. Set O's [[DataView]] internal slot to true.
    O.$DataView = true;

    // 12. Set O's [[ViewedArrayBuffer]] internal slot to buffer.
    O.$ViewedArrayBuffer = buffer;

    // 13. Set O's [[ByteLength]] internal slot to viewByteLength.
    O.$ByteLength = viewByteLength;

    // 14. Set O's [[ByteOffset]] internal slot to offset.
    O.$ByteOffset = offset;

    // 15. Return O.
    return O;
  });

  return func;
}
