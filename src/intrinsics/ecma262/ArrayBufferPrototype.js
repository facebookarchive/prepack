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
import { ObjectValue, StringValue, NumberValue, UndefinedValue } from "../../values/index.js";
import { Construct, CopyDataBlockBytes, IsDetachedBuffer, SameValue, SpeciesConstructor } from "../../methods/index.js";
import { To } from "../../singletons.js";
import invariant from "../../invariant.js";

export default function(realm: Realm, obj: ObjectValue): void {
  // ECMA262 24.1.4.1
  obj.defineNativeGetter("byteLength", context => {
    // 1. Let O be the this value.
    let O = context.throwIfNotConcrete();

    // 2. If Type(O) is not Object, throw a TypeError exception.
    if (!(O instanceof ObjectValue)) {
      throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError, "Type(O) is not Object");
    }

    // 3. If O does not have an [[ArrayBufferData]] internal slot, throw a TypeError exception.
    if (!("$ArrayBufferData" in O)) {
      throw realm.createErrorThrowCompletion(
        realm.intrinsics.TypeError,
        "O does not have an [[ArrayBufferData]] internal slot"
      );
    }

    // 4. If IsDetachedBuffer(O) is true, throw a TypeError exception.
    if (IsDetachedBuffer(realm, O) === true) {
      throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError, "IsDetachedBuffer(O) is true");
    }

    // 5. Let length be O.[[ArrayBufferByteLength]].
    let length = O.$ArrayBufferByteLength;
    invariant(typeof length === "number");

    // 6. Return length.
    return new NumberValue(realm, length);
  });

  // ECMA262 24.1.4.3
  obj.defineNativeMethod("slice", 2, (context, [start, end]) => {
    // 1. Let O be the this value.
    let O = context.throwIfNotConcrete();

    // 2. If Type(O) is not Object, throw a TypeError exception.
    if (!(O instanceof ObjectValue)) {
      throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError, "Type(O) is not Object");
    }

    // 3. If O does not have an [[ArrayBufferData]] internal slot, throw a TypeError exception.
    if (!("$ArrayBufferData" in O)) {
      throw realm.createErrorThrowCompletion(
        realm.intrinsics.TypeError,
        "O does not have an [[ArrayBufferData]] internal slot"
      );
    }

    // 4. If IsDetachedBuffer(O) is true, throw a TypeError exception.
    if (IsDetachedBuffer(realm, O) === true) {
      throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError, "IsDetachedBuffer(O) is true");
    }

    // 5. Let len be O.[[ArrayBufferByteLength]].
    let len = O.$ArrayBufferByteLength;
    invariant(typeof len === "number");

    // 6. Let relativeStart be ? ToInteger(start).
    let relativeStart = To.ToInteger(realm, start);

    // 7. If relativeStart < 0, let first be max((len + relativeStart), 0); else let first be min(relativeStart, len).
    let first = relativeStart < 0 ? Math.max(len + relativeStart, 0) : Math.min(relativeStart, len);

    // 8. If end is undefined, let relativeEnd be len; else let relativeEnd be ? ToInteger(end).
    let relativeEnd = !end || end instanceof UndefinedValue ? len : To.ToInteger(realm, end.throwIfNotConcrete());

    // 9. If relativeEnd < 0, let final be max((len + relativeEnd), 0); else let final be min(relativeEnd, len).
    let final = relativeEnd < 0 ? Math.max(len + relativeEnd, 0) : Math.min(relativeEnd, len);

    // 10. Let newLen be max(final-first, 0).
    let newLen = Math.max(final - first, 0);

    // 11. Let ctor be ? SpeciesConstructor(O, %ArrayBuffer%).
    let ctor = SpeciesConstructor(realm, O, realm.intrinsics.ArrayBuffer);

    // 12. Let New be ? Construct(ctor, « newLen »).
    let New = Construct(realm, ctor, [new NumberValue(realm, newLen)]).throwIfNotConcreteObject();

    // 13. If New does not have an [[ArrayBufferData]] internal slot, throw a TypeError exception.
    if (!("$ArrayBufferData" in New)) {
      throw realm.createErrorThrowCompletion(
        realm.intrinsics.TypeError,
        "new does not have an [[ArrayBufferData]] internal slot"
      );
    }

    // 14. If IsDetachedBuffer(New) is true, throw a TypeError exception.
    if (IsDetachedBuffer(realm, New) === true) {
      throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError, "IsDetachedBuffer(new) is true");
    }

    // 15. If SameValue(New, O) is true, throw a TypeError exception.
    if (SameValue(realm, New, O) === true) {
      throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError, "SameValue(new, O) is true");
    }

    // 16. If new.[[ArrayBufferByteLength]] < newLen, throw a TypeError exception.
    if (typeof New.$ArrayBufferByteLength !== "number" || New.$ArrayBufferByteLength < newLen) {
      throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError, "new.[[ArrayBufferByteLength]] < newLen");
    }

    // 17. NOTE: Side-effects of the above steps may have detached O.

    // 18. If IsDetachedBuffer(O) is true, throw a TypeError exception.
    if (IsDetachedBuffer(realm, O) === true) {
      throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError, "IsDetachedBuffer(O) is true");
    }

    // 19. Let fromBuf be O.[[ArrayBufferData]].
    let fromBuf = O.$ArrayBufferData;
    invariant(fromBuf);

    // 20. Let toBuf be New.[[ArrayBufferData]].
    let toBuf = New.$ArrayBufferData;
    invariant(toBuf);

    // 21. Perform CopyDataBlockBytes(toBuf, 0, fromBuf, first, newLen).
    CopyDataBlockBytes(realm, toBuf, 0, fromBuf, first, newLen);

    // 22. Return New.
    return New;
  });

  // ECMA262 24.1.4.4
  obj.defineNativeProperty(realm.intrinsics.SymbolToStringTag, new StringValue(realm, "ArrayBuffer"), {
    writable: false,
  });
}
