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
import type { ElementType } from "../../types.js";
import { ElementSize } from "../../types.js";
import { ObjectValue, StringValue, NumberValue, UndefinedValue, NullValue } from "../../values/index.js";
import { Call, Invoke } from "../../methods/call.js";
import { Get } from "../../methods/get.js";
import { HasProperty, HasSomeCompatibleType } from "../../methods/has.js";
import { IsDetachedBuffer, IsCallable } from "../../methods/is.js";
import {
  ArrayElementSize,
  ArrayElementType,
  ValidateTypedArray,
  TypedArraySpeciesCreate,
  IntegerIndexedElementSet,
  IntegerIndexedElementGet,
} from "../../methods/typedarray.js";
import { SetValueInBuffer, GetValueFromBuffer, CloneArrayBuffer } from "../../methods/arraybuffer.js";
import { SameValue, SameValueZeroPartial, StrictEqualityComparisonPartial } from "../../methods/abstract.js";
import { Create, Properties, To } from "../../singletons.js";
import invariant from "../../invariant.js";

export default function(realm: Realm, obj: ObjectValue): void {
  // ECMA262 22.2.3.1
  obj.defineNativeGetter("buffer", context => {
    // 1. Let O be the this value.
    let O = context.throwIfNotConcrete();

    // 2. If Type(O) is not Object, return undefined.
    if (!(O instanceof ObjectValue)) {
      throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError, "Type(O) is not Object");
    }

    // 3. If O does not have a [[TypedArrayName]] internal slot, throw a TypeError exception.
    if (!("$TypedArrayName" in O)) {
      throw realm.createErrorThrowCompletion(
        realm.intrinsics.TypeError,
        "O does not have a [[TypedArrayName]] internal slot"
      );
    }

    // 4. Assert: O has a [[ViewedArrayBuffer]] internal slot.
    invariant(O.$ViewedArrayBuffer, "O has a [[ViewedArrayBuffer]]");

    // 5. Let buffer be O.[[ViewedArrayBuffer]].
    let buffer = O.$ViewedArrayBuffer;

    // 6. Return buffer.
    return buffer;
  });

  // ECMA262 22.2.3.2
  obj.defineNativeGetter("byteLength", context => {
    // 1. Let O be the this value.
    let O = context.throwIfNotConcrete();

    // 2. If Type(O) is not Object, throw a TypeError exception.
    if (!(O instanceof ObjectValue)) {
      throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError, "Type(O) is not Object");
    }

    // 3. If O does not have a [[TypedArrayName]] internal slot, throw a TypeError exception.
    if (!("$TypedArrayName" in O)) {
      throw realm.createErrorThrowCompletion(
        realm.intrinsics.TypeError,
        "O does not have a [[TypedArrayName]] internal slot"
      );
    }

    // 4. Assert: O has [[ViewedArrayBuffer]] and [[ArrayLength]] internal slots.
    invariant(O.$ViewedArrayBuffer, "O has a [[ViewedArrayBuffer]] internal slot");

    // 5. Let buffer be O.[[ViewedArrayBuffer]].
    let buffer = O.$ViewedArrayBuffer;
    invariant(buffer);

    // 6. If IsDetachedBuffer(buffer) is true, return 0.
    if (IsDetachedBuffer(realm, buffer) === true) return realm.intrinsics.zero;

    // 7. Let size be O.[[ByteLength]].
    let size = O.$ByteLength;
    invariant(typeof size === "number");

    // 8. Return size.
    return new NumberValue(realm, size);
  });

  // ECMA262 22.2.3.3
  obj.defineNativeGetter("byteOffset", context => {
    // 1. Let O be the this value.
    let O = context.throwIfNotConcrete();

    // 2. If Type(O) is not Object, throw a TypeError exception.
    if (!(O instanceof ObjectValue)) {
      throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError, "Type(O) is not Object");
    }

    // 3. If O does not have a [[TypedArrayName]] internal slot, throw a TypeError exception.
    if (!("$TypedArrayName" in O)) {
      throw realm.createErrorThrowCompletion(
        realm.intrinsics.TypeError,
        "O does not have a [[TypedArrayName]] internal slot"
      );
    }

    // 4. Assert: O has [[ViewedArrayBuffer]] and [[ArrayLength]] internal slots.
    invariant(O.$ViewedArrayBuffer, "O has a [[ViewedArrayBuffer]] internal slot");

    // 5. Let buffer be O.[[ViewedArrayBuffer]].
    let buffer = O.$ViewedArrayBuffer;
    invariant(buffer);

    // 6. If IsDetachedBuffer(buffer) is true, return 0.
    if (IsDetachedBuffer(realm, buffer) === true) return realm.intrinsics.zero;

    // 7. Let offset be O.[[ByteOffset]].
    let offset = O.$ByteOffset;
    invariant(typeof offset === "number");

    // 8. Return offset.
    return new NumberValue(realm, offset);
  });

  // ECMA262 22.2.3.5
  obj.defineNativeMethod("copyWithin", 2, (context, [target, start, end]) => {
    // 1. Let O be ? ToObject(this value).
    let O = To.ToObject(realm, context);

    // 2. Perform ? ValidateTypedArray(O).
    ValidateTypedArray(realm, O);

    // 3. Let len be O.[[ArrayLength]].
    let len = O.throwIfNotConcreteObject().$ArrayLength;
    invariant(typeof len === "number");

    // 4. Let relativeTarget be ? ToInteger(target).
    let relativeTarget = To.ToInteger(realm, target);

    // 5. If relativeTarget < 0, let to be max((len + relativeTarget), 0); else let to be min(relativeTarget, len).
    let to = relativeTarget < 0 ? Math.max(len + relativeTarget, 0) : Math.min(relativeTarget, len);

    // 6. Let relativeStart be ? ToInteger(start).
    let relativeStart = To.ToInteger(realm, start);

    // 7. If relativeStart < 0, let from be max((len + relativeStart), 0); else let from be min(relativeStart, len).
    let from = relativeStart < 0 ? Math.max(len + relativeStart, 0) : Math.min(relativeStart, len);

    // 8. If end is undefined, let relativeEnd be len; else let relativeEnd be ? ToInteger(end).
    let relativeEnd = !end || end instanceof UndefinedValue ? len : To.ToInteger(realm, end.throwIfNotConcrete());

    // 9. If relativeEnd < 0, let final be max((len + relativeEnd), 0); else let final be min(relativeEnd, len).
    let final = relativeEnd < 0 ? Math.max(len + relativeEnd, 0) : Math.min(relativeEnd, len);

    // 10. Let count be min(final-from, len-to).
    let count = Math.min(final - from, len - to);

    let direction;
    // 11. If from<to and to<from+count, then
    if (from < to && to < from + count) {
      // a. Let direction be -1.
      direction = -1;

      // b. Let from be from + count - 1.
      from = from + count - 1;

      // c. Let to be to + count - 1.
      to = to + count - 1;
    } else {
      // 12. Else,
      // a. Let direction be 1.
      direction = 1;
    }

    // 13. Repeat, while count > 0
    while (count > 0) {
      // a. Let fromKey be ! ToString(from).
      let fromKey = To.ToString(realm, new NumberValue(realm, from));

      // b. Let toKey be ! ToString(to).
      let toKey = To.ToString(realm, new NumberValue(realm, to));

      // c. Let fromPresent be ? HasProperty(O, fromKey).
      let fromPresent = HasProperty(realm, O, fromKey);

      // d. If fromPresent is true, then
      if (fromPresent === true) {
        // i. Let fromVal be ? Get(O, fromKey).
        let fromVal = Get(realm, O, fromKey);
        // ii. Perform ? Set(O, toKey, fromVal, true).
        Properties.Set(realm, O, toKey, fromVal, true);
      } else {
        // e. Else fromPresent is false,
        // i. Perform ? DeletePropertyOrThrow(O, toKey).
        Properties.DeletePropertyOrThrow(realm, O.throwIfNotConcreteObject(), toKey);
      }

      // f. Let from be from + direction.
      from = from + direction;

      // g. Let to be to + direction.
      to = to + direction;

      // h. Let count be count - 1.
      count = count - 1;
    }

    // 14. Return O.
    return O;
  });

  // ECMA262 22.2.3.6
  obj.defineNativeMethod("entries", 0, context => {
    // 1. Let O be the this value.
    let O = context;

    // 2. Perform ? ValidateTypedArray(O).
    ValidateTypedArray(realm, O);
    invariant(O instanceof ObjectValue);

    // 3. Return CreateArrayIterator(O, "key+value").
    return Create.CreateArrayIterator(realm, O, "key+value");
  });

  // ECMA262 22.2.3.7
  obj.defineNativeMethod("every", 1, (context, [callbackfn, thisArg]) => {
    // 1. Let O be ? ToObject(this value).
    let O = To.ToObject(realm, context);

    // 2. Perform ? ValidateTypedArray(O).
    ValidateTypedArray(realm, O);

    // 3. Let len be O.[[ArrayLength]].
    let len = O.throwIfNotConcreteObject().$ArrayLength;
    invariant(typeof len === "number");

    // 4. If IsCallable(callbackfn) is false, throw a TypeError exception.
    if (!IsCallable(realm, callbackfn)) {
      throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError, "not a function");
    }

    // 5. If thisArg was supplied, let T be thisArg; else let T be undefined.
    let T = thisArg || realm.intrinsics.undefined;

    // 6. Let k be 0.
    let k = 0;

    // 7. Repeat, while k < len
    while (k < len) {
      // a. Let Pk be ! ToString(k).
      let Pk = new StringValue(realm, k + "");

      // b. Let kPresent be ? HasProperty(O, Pk).
      let kPresent = HasProperty(realm, O, Pk);

      // c. If kPresent is true, then
      if (kPresent) {
        // i. Let kValue be ? Get(O, Pk).
        let kValue = Get(realm, O, Pk);

        // ii. Let testResult be ToBoolean(? Call(callbackfn, T, « kValue, k, O »)).
        let testResult = To.ToBooleanPartial(realm, Call(realm, callbackfn, T, [kValue, new NumberValue(realm, k), O]));

        // iii. If testResult is false, return false.
        if (!testResult) return realm.intrinsics.false;
      }

      // d. Increase k by 1.
      k++;
    }

    // 8. Return true.
    return realm.intrinsics.true;
  });

  // ECMA262 22.2.3.8
  obj.defineNativeMethod("fill", 1, (context, [value, start, end]) => {
    // 1. Let O be ? ToObject(this value).
    let O = To.ToObject(realm, context);

    // 2. Perform ? ValidateTypedArray(O).
    ValidateTypedArray(realm, O);

    // 3. Let len be O.[[ArrayLength]].
    let len = O.throwIfNotConcreteObject().$ArrayLength;
    invariant(typeof len === "number");

    // 4. Let relativeStart be ? ToInteger(start).
    let relativeStart = To.ToInteger(realm, start || realm.intrinsics.undefined);

    // 5. If relativeStart < 0, let k be max((len + relativeStart), 0); else let k be min(relativeStart, len).
    let k = relativeStart < 0 ? Math.max(len + relativeStart, 0) : Math.min(relativeStart, len);

    // 6. If end is undefined, let relativeEnd be len; else let relativeEnd be ? ToInteger(end).
    let relativeEnd = !end || end instanceof UndefinedValue ? len : To.ToInteger(realm, end.throwIfNotConcrete());

    // 7. If relativeEnd < 0, let final be max((len + relativeEnd), 0); else let final be min(relativeEnd, len).
    let final = relativeEnd < 0 ? Math.max(len + relativeEnd, 0) : Math.min(relativeEnd, len);

    // 8. Repeat, while k < final
    while (k < final) {
      // a. Let Pk be ! ToString(k).
      let Pk = new StringValue(realm, k + "");

      // b. Perform ? Set(O, Pk, value, true).
      Properties.Set(realm, O, Pk, value, true);

      // c. Increase k by 1.
      k++;
    }

    // 9. Return O.
    return O;
  });

  // ECMA262 22.2.3.9
  obj.defineNativeMethod("filter", 1, (context, [callbackfn, thisArg]) => {
    // 1. Let O be the this value.
    let O = context;

    // 2. Perform ? ValidateTypedArray(O).
    ValidateTypedArray(realm, O);
    invariant(O instanceof ObjectValue);

    // 3. Let len be O.[[ArrayLength]].
    let len = O.$ArrayLength;
    invariant(typeof len === "number");

    // 4. If IsCallable(callbackfn) is false, throw a TypeError exception.
    if (IsCallable(realm, callbackfn) === false) {
      throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError, "IsCallable(callbackfn) is false");
    }

    // 5. If thisArg was supplied, let T be thisArg; else let T be undefined.
    let T = thisArg ? thisArg : realm.intrinsics.undefined;

    // 6. Let kept be a new empty List.
    let kept = [];

    // 7. Let k be 0.
    let k = 0;

    // 8. Let captured be 0.
    let captured = 0;

    // 9. Repeat, while k < len
    while (k < len) {
      // a. Let Pk be ! ToString(k).
      let Pk = To.ToString(realm, new NumberValue(realm, k));

      // b. Let kValue be ? Get(O, Pk).
      let kValue = Get(realm, O, Pk);

      // c. Let selected be ToBoolean(? Call(callbackfn, T, « kValue, k, O »)).
      let selected = To.ToBooleanPartial(realm, Call(realm, callbackfn, T, [kValue, new NumberValue(realm, k), O]));

      // d. If selected is true, then
      if (selected === true) {
        // i. Append kValue to the end of kept.
        kept.push(kValue);

        // ii. Increase captured by 1.
        captured += 1;
      }

      // e. Increase k by 1.
      k += 1;
    }

    // 10. Let A be ? TypedArraySpeciesCreate(O, « captured »).
    let A = TypedArraySpeciesCreate(realm, O, [new NumberValue(realm, captured)]);

    // 11. Let n be 0.
    let n = 0;

    // 12. For each element e of kept
    for (let e of kept) {
      // a. Perform ! Set(A, ! ToString(n), e, true).
      Properties.Set(realm, A, new StringValue(realm, To.ToString(realm, new NumberValue(realm, n))), e, true);

      // b. Increment n by 1.
      n = n + 1;
    }

    // 13. Return A.
    return A;
  });

  // ECMA262 22.2.3.10
  obj.defineNativeMethod("find", 1, (context, [predicate, thisArg]) => {
    // 1. Let O be ? ToObject(this value).
    let O = To.ToObject(realm, context);

    // 2. Perform ? ValidateTypedArray(O).
    ValidateTypedArray(realm, O);

    // 3. Let len be O.[[ArrayLength]].
    let len = O.throwIfNotConcreteObject().$ArrayLength;
    invariant(typeof len === "number");

    // 4. If IsCallable(predicate) is false, throw a TypeError exception.
    if (!IsCallable(realm, predicate)) {
      throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError, "not a function");
    }

    // 5. If thisArg was supplied, let T be thisArg; else let T be undefined.
    let T = thisArg || realm.intrinsics.undefined;

    // 6. Let k be 0.
    let k = 0;

    // 7. Repeat, while k < len
    while (k < len) {
      // a. Let Pk be ! ToString(k).
      let Pk = new StringValue(realm, k + "");

      // b. Let kValue be ? Get(O, Pk).
      let kValue = Get(realm, O, Pk);

      // c. Let testResult be ToBoolean(? Call(predicate, T, « kValue, k, O »)).
      let testResult = To.ToBooleanPartial(realm, Call(realm, predicate, T, [kValue, new NumberValue(realm, k), O]));

      // d. If testResult is true, return kValue.
      if (testResult) return kValue;

      // e. Increase k by 1.
      k++;
    }

    // 8. Return undefined.
    return realm.intrinsics.undefined;
  });

  // ECMA262 22.2.3.11
  obj.defineNativeMethod("findIndex", 1, (context, [predicate, thisArg]) => {
    // 1. Let O be ? ToObject(this value).
    let O = To.ToObject(realm, context);

    // 2. Perform ? ValidateTypedArray(O).
    ValidateTypedArray(realm, O);

    // 3. Let len be O.[[ArrayLength]].
    let len = O.throwIfNotConcreteObject().$ArrayLength;
    invariant(typeof len === "number");

    // 4. If IsCallable(predicate) is false, throw a TypeError exception.
    if (IsCallable(realm, predicate) === false) {
      throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError, "not a function");
    }

    // 5. If thisArg was supplied, let T be thisArg; else let T be undefined.
    let T = thisArg ? thisArg : realm.intrinsics.undefined;

    // 6. Let k be 0.
    let k = 0;

    // 7. Repeat, while k < len
    while (k < len) {
      // a. Let Pk be ! ToString(k).
      let Pk = To.ToString(realm, new NumberValue(realm, k));

      // b. Let kValue be ? Get(O, Pk).
      let kValue = Get(realm, O, new StringValue(realm, Pk));

      // c. Let testResult be ToBoolean(? Call(predicate, T, « kValue, k, O »)).
      let testResult = To.ToBooleanPartial(realm, Call(realm, predicate, T, [kValue, new NumberValue(realm, k), O]));

      // d. If testResult is true, return k.
      if (testResult === true) return new NumberValue(realm, k);

      // e. Increase k by 1.
      k = k + 1;
    }

    // 8. Return -1.
    return new NumberValue(realm, -1);
  });

  // ECMA262 22.2.3.12
  obj.defineNativeMethod("forEach", 1, (context, [callbackfn, thisArg]) => {
    // 1. Let O be ? ToObject(this value).
    let O = To.ToObject(realm, context);

    // 2. Perform ? ValidateTypedArray(O).
    ValidateTypedArray(realm, O);

    // 3. Let len be O.[[ArrayLength]].
    let len = O.throwIfNotConcreteObject().$ArrayLength;
    invariant(typeof len === "number");

    // 4. If IsCallable(callbackfn) is false, throw a TypeError exception.
    if (!IsCallable(realm, callbackfn)) {
      throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError, "not a function");
    }

    // 5. If thisArg was supplied, let T be thisArg; else let T be undefined.
    let T = thisArg || realm.intrinsics.undefined;

    // 6. Let k be 0.
    let k = 0;

    // 7. Repeat, while k < len
    while (k < len) {
      // a. Let Pk be ! ToString(k).
      let Pk = new StringValue(realm, k + "");

      // b. Let kPresent be ? HasProperty(O, Pk).
      let kPresent = HasProperty(realm, O, Pk);

      // c. If kPresent is true, then
      if (kPresent) {
        // i. Let kValue be ? Get(O, Pk).
        let kValue = Get(realm, O, Pk);

        // ii. Perform ? Call(callbackfn, T, « kValue, k, O »).
        Call(realm, callbackfn, T, [kValue, new NumberValue(realm, k), O]);
      }

      // d. Increase k by 1.
      k++;
    }

    // 8. Return undefined.
    return realm.intrinsics.undefined;
  });

  // ECMA262 22.2.3.14
  obj.defineNativeMethod("includes", 1, (context, [searchElement, fromIndex]) => {
    // 1. Let O be ? ToObject(this value).
    let O = To.ToObject(realm, context);

    // 2. Perform ? ValidateTypedArray(O).
    ValidateTypedArray(realm, O);

    // 3. Let len be O.[[ArrayLength]].
    let len = O.throwIfNotConcreteObject().$ArrayLength;
    invariant(typeof len === "number");

    // 4. If len is 0, return false.
    if (len === 0) return realm.intrinsics.false;

    // 5. Let n be ? ToInteger(fromIndex). (If fromIndex is undefined, this step produces the value 0.)
    let n = To.ToInteger(realm, fromIndex || realm.intrinsics.undefined);

    let k;
    // 6. If n ≥ 0, then
    if (n >= 0) {
      // a. Let k be n.
      k = n;
    } else {
      // 7. Else n < 0,
      // a. Let k be len + n.
      k = len + n;
      // b. If k < 0, let k be 0.
      if (k < 0) k = 0;
    }

    // 8. Repeat, while k < len
    while (k < len) {
      // a. Let elementK be the result of ? Get(O, ! ToString(k)).
      let elementK = Get(realm, O, To.ToString(realm, new NumberValue(realm, k)));

      // b. If SameValueZero(searchElement, elementK) is true, return true.
      if (SameValueZeroPartial(realm, searchElement, elementK) === true) return realm.intrinsics.true;

      // c. Increase k by 1.
      k = k + 1;
    }

    // 9. Return false.
    return realm.intrinsics.false;
  });

  // ECMA262 22.2.3.14
  obj.defineNativeMethod("indexOf", 1, (context, [searchElement, fromIndex]) => {
    // 1. Let O be ? ToObject(this value).
    let O = To.ToObject(realm, context);

    // 2. Perform ? ValidateTypedArray(O).
    ValidateTypedArray(realm, O);

    // 3. Let len be O.[[ArrayLength]].
    let len = O.throwIfNotConcreteObject().$ArrayLength;
    invariant(typeof len === "number");

    // 4. If len is 0, return -1.
    if (len === 0) return new NumberValue(realm, -1);

    // 5. Let n be ? ToInteger(fromIndex). (If fromIndex is undefined, this step produces the value 0.)
    let n = fromIndex ? To.ToInteger(realm, fromIndex) : 0;

    // 6. If n ≥ len, return -1.
    if (n >= len) return new NumberValue(realm, -1);

    // 7. If n ≥ 0, then
    let k;
    if (n >= 0) {
      // a. If n is -0, let k be +0; else let k be n.
      k = Object.is(n, -0) ? +0 : n;
    } else {
      // 8. Else n < 0,
      // a. Let k be len + n.
      k = len + n;

      // b. If k < 0, let k be 0.
      if (k < 0) k = 0;
    }

    // 9. Repeat, while k < len
    while (k < len) {
      // a. Let kPresent be ? HasProperty(O, ! ToString(k)).
      let kPresent = HasProperty(realm, O, k + "");

      // b. If kPresent is true, then
      if (kPresent === true) {
        // i. Let elementK be ? Get(O, ! ToString(k)).
        let elementK = Get(realm, O, k + "");

        // ii. Let same be the result of performing Strict Equality Comparison searchElement === elementK.
        let same = StrictEqualityComparisonPartial(realm, searchElement, elementK);

        // iii. If same is true, return k.
        if (same) return new NumberValue(realm, k);
      }

      // c. Increase k by 1.
      k++;
    }

    // 10. Return -1.
    return new NumberValue(realm, -1);
  });

  // ECMA262 22.2.3.15
  obj.defineNativeMethod("join", 1, (context, [_separator]) => {
    let separator = _separator;
    // 1. Let O be ? ToObject(this value).
    let O = To.ToObject(realm, context);

    // 2. Perform ? ValidateTypedArray(O).
    ValidateTypedArray(realm, O);

    // 3. Let len be O.[[ArrayLength]].
    let len = O.throwIfNotConcreteObject().$ArrayLength;
    invariant(typeof len === "number");

    // 4. If separator is undefined, let separator be the single-element String ",".
    if (!separator || separator instanceof UndefinedValue) separator = new StringValue(realm, ",");

    // 5. Let sep be ? ToString(separator).
    let sep = To.ToStringPartial(realm, separator);

    // 6. If len is zero, return the empty String.
    if (len === 0) return realm.intrinsics.emptyString;

    // 7. Let element0 be Get(O, "0").
    let element0 = Get(realm, O, "0");

    // 8. If element0 is undefined or null, let R be the empty String; otherwise, let R be ? ToString(element0).
    let R: ?string;
    if (HasSomeCompatibleType(element0, UndefinedValue, NullValue)) {
      R = "";
    } else {
      R = To.ToStringPartial(realm, element0);
    }

    // 9. Let k be 1.
    let k = 1;

    // 10. Repeat, while k < len
    while (k < len) {
      // a. Let S be the String value produced by concatenating R and sep.
      let S: string = R + sep;

      // b. Let element be ? Get(O, ! ToString(k)).
      let element = Get(realm, O, new StringValue(realm, k + ""));

      // c. If element is undefined or null, let next be the empty String; otherwise, let next be ? ToString(element).
      let next: ?string;
      if (HasSomeCompatibleType(element, UndefinedValue, NullValue)) {
        next = "";
      } else {
        next = To.ToStringPartial(realm, element);
      }

      // d. Let R be a String value produced by concatenating S and next.
      R = S + next;

      // e. Increase k by 1.
      k++;
    }

    // 11. Return R.
    return new StringValue(realm, R + "");
  });

  // ECMA262 22.2.3.16
  obj.defineNativeMethod("keys", 0, context => {
    // 1. Let O be the this value.
    let O = context;

    // 2. Perform ? ValidateTypedArray(O).
    ValidateTypedArray(realm, O);
    invariant(O instanceof ObjectValue);

    // 3. Return CreateArrayIterator(O, "key").
    return Create.CreateArrayIterator(realm, O, "key");
  });

  // ECMA262 22.2.3.17
  obj.defineNativeMethod("lastIndexOf", 1, (context, [searchElement, fromIndex]) => {
    // 1. Let O be ? ToObject(this value).
    let O = To.ToObject(realm, context);

    // 2. Perform ? ValidateTypedArray(O).
    ValidateTypedArray(realm, O);

    // 3. Let len be O.[[ArrayLength]].
    let len = O.throwIfNotConcreteObject().$ArrayLength;
    invariant(typeof len === "number");

    // 4. If len is 0, return -1.
    if (len === 0) return new NumberValue(realm, -1);

    // 5. If argument fromIndex was passed, let n be ? ToInteger(fromIndex); else let n be len-1.
    let n = fromIndex ? To.ToInteger(realm, fromIndex) : len - 1;

    // 6. If n ≥ 0, then
    let k;
    if (n >= 0) {
      // a. If n is -0, let k be +0; else let k be min(n, len - 1).
      k = Object.is(n, -0) ? +0 : Math.min(n, len - 1);
    } else {
      // 7. Else n < 0,
      // a. Let k be len + n.
      k = len + n;
    }

    // 8. Repeat, while k ≥ 0
    while (k >= 0) {
      // a. Let kPresent be ? HasProperty(O, ! ToString(k)).
      let kPresent = HasProperty(realm, O, new StringValue(realm, k + ""));

      // b. If kPresent is true, then
      if (kPresent) {
        // i. Let elementK be ? Get(O, ! ToString(k)).
        let elementK = Get(realm, O, new StringValue(realm, k + ""));

        // ii. Let same be the result of performing Strict Equality Comparison searchElement === elementK.
        let same = StrictEqualityComparisonPartial(realm, searchElement, elementK);

        // iii. If same is true, return k.
        if (same) return new NumberValue(realm, k);
      }

      // c. Decrease k by 1.
      k--;
    }

    // 9. Return -1.
    return new NumberValue(realm, -1);
  });

  // ECMA262 22.2.3.18
  obj.defineNativeGetter("length", context => {
    // 1. Let O be the this value.
    let O = context.throwIfNotConcrete();

    // 2. If Type(O) is not Object, throw a TypeError exception.
    if (!(O instanceof ObjectValue)) {
      throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError, "Type(O) is not Object");
    }

    // 3. If O does not have a [[TypedArrayName]] internal slot, throw a TypeError exception.
    if (!("$TypedArrayName" in O)) {
      throw realm.createErrorThrowCompletion(
        realm.intrinsics.TypeError,
        "O does not have a [[TypedArrayName]] internal slot"
      );
    }

    // 4. Assert: O has [[ViewedArrayBuffer]] and [[ArrayLength]] internal slots.
    invariant(O.$ViewedArrayBuffer, "O has a [[ViewedArrayBuffer]] internal slot");

    // 5. Let buffer be O.[[ViewedArrayBuffer]].
    let buffer = O.$ViewedArrayBuffer;
    invariant(buffer);

    // 6. If IsDetachedBuffer(buffer) is true, return 0.
    if (IsDetachedBuffer(realm, buffer) === true) return realm.intrinsics.zero;

    // 7. Let length be O.[[ArrayLength]].
    let length = O.$ArrayLength;
    invariant(typeof length === "number");

    // 8. Return length.
    return new NumberValue(realm, length);
  });

  // ECMA262 22.2.3.19
  obj.defineNativeMethod("map", 1, (context, [callbackfn, thisArg]) => {
    // 1. Let O be the this value.
    let O = context;

    // 2. Perform ? ValidateTypedArray(O).
    ValidateTypedArray(realm, O);
    invariant(O instanceof ObjectValue);

    // 3. Let len be O.[[ArrayLength]].
    let len = O.$ArrayLength;
    invariant(typeof len === "number");

    // 4. If IsCallable(callbackfn) is false, throw a TypeError exception.
    if (IsCallable(realm, callbackfn) === false) {
      throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError, "IsCallable(callbackfn) is false");
    }

    // 5. If thisArg was supplied, let T be thisArg; else let T be undefined.
    let T = thisArg ? thisArg : realm.intrinsics.undefined;

    // 6. Let A be ? TypedArraySpeciesCreate(O, « len »).
    let A = TypedArraySpeciesCreate(realm, O, [new NumberValue(realm, len)]);

    // 7. Let k be 0.
    let k = 0;

    // 8. Repeat, while k < len
    while (k < len) {
      // a. Let Pk be ! ToString(k).
      let Pk = To.ToString(realm, new NumberValue(realm, k));

      // b. Let kValue be ? Get(O, Pk).
      let kValue = Get(realm, O, Pk);

      // c. Let mappedValue be ? Call(callbackfn, T, « kValue, k, O »).
      let mappedValue = Call(realm, callbackfn, T, [kValue, new NumberValue(realm, k), O]);

      // d. Perform ? Set(A, Pk, mappedValue, true).
      Properties.Set(realm, A, Pk, mappedValue, true);

      // e. Increase k by 1.
      k = k + 1;
    }

    // 9. Return A.
    return A;
  });

  // ECMA262 22.2.3.20
  obj.defineNativeMethod("reduce", 1, (context, [callbackfn, initialValue]) => {
    // 1. Let O be ? ToObject(this value).
    let O = To.ToObject(realm, context);

    // 2. Perform ? ValidateTypedArray(O).
    ValidateTypedArray(realm, O);

    // 3. Let len be O.[[ArrayLength]].
    let len = O.throwIfNotConcreteObject().$ArrayLength;
    invariant(typeof len === "number");

    // 4. If IsCallable(callbackfn) is false, throw a TypeError exception.
    if (!IsCallable(realm, callbackfn)) {
      throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError, "not a function");
    }

    // 5. If len is 0 and initialValue is not present, throw a TypeError exception.
    if (len === 0 && !initialValue) {
      throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError, "Array.prototype");
    }

    // 6. Let k be 0.
    let k = 0;

    // 7. If initialValue is present, then
    let accumulator;
    if (initialValue) {
      // a. Set accumulator to initialValue.
      accumulator = initialValue;
    } else {
      // 8. Else initialValue is not present,
      // a. Let kPresent be false.
      let kPresent = false;

      // b. Repeat, while kPresent is false and k < len
      while (kPresent === false && k < len) {
        // i. Let Pk be ! ToString(k).
        let Pk = new StringValue(realm, k + "");

        // ii. Let kPresent be ? HasProperty(O, Pk).
        kPresent = HasProperty(realm, O, Pk);

        // iv. If kPresent is true, then
        if (kPresent) {
          // 1. Let accumulator be ? Get(O, Pk).
          accumulator = Get(realm, O, Pk);
        }

        // v. Increase k by 1.
        k++;
      }

      // c. If kPresent is false, throw a TypeError exception.
      if (!kPresent) {
        throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError, "kPresent is false");
      }

      invariant(accumulator);
    }

    // 9. Repeat, while k < len
    while (k < len) {
      // a. Let Pk be ! ToString(k).
      let Pk = new StringValue(realm, k + "");

      // b. Let kPresent be ? HasProperty(O, Pk).
      let kPresent = HasProperty(realm, O, Pk);

      // c. If kPresent is true, then
      if (kPresent) {
        // i. Let kValue be ? Get(O, Pk).
        let kValue = Get(realm, O, Pk);

        // ii. Let accumulator be ? Call(callbackfn, undefined, « accumulator, kValue, k, O »).
        accumulator = Call(realm, callbackfn, realm.intrinsics.undefined, [
          accumulator,
          kValue,
          new NumberValue(realm, k),
          O,
        ]);
      }

      // d. Increase k by 1.
      k++;
    }

    // 10. Return accumulator.
    return accumulator;
  });

  // ECMA262 22.2.3.21
  obj.defineNativeMethod("reduceRight", 1, (context, [callbackfn, initialValue]) => {
    // 1. Let O be ? ToObject(this value).
    let O = To.ToObject(realm, context);

    // 2. Perform ? ValidateTypedArray(O).
    ValidateTypedArray(realm, O);

    // 3. Let len be O.[[ArrayLength]].
    let len = O.throwIfNotConcreteObject().$ArrayLength;
    invariant(typeof len === "number");

    // 4. If IsCallable(callbackfn) is false, throw a TypeError exception.
    if (!IsCallable(realm, callbackfn)) {
      throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError, "not a function");
    }

    // 5. If len is 0 and initialValue is not present, throw a TypeError exception.
    if (len === 0 && !initialValue) {
      throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError, "Array.prototype");
    }

    // 6. Let k be len-1.
    let k = len - 1;

    // 7. If initialValue is present, then
    let accumulator;
    if (initialValue) {
      // 1. Set accumulator to initialValue.
      accumulator = initialValue;
    } else {
      // 8. Else initialValue is not present,
      // a. Let kPresent be false.
      let kPresent = false;

      // b. Repeat, while kPresent is false and k ≥ 0
      while (!kPresent && k >= 0) {
        // i. Let Pk be ! ToString(k).
        let Pk = new StringValue(realm, k + "");

        // ii. Let kPresent be ? HasProperty(O, Pk).
        kPresent = HasProperty(realm, O, Pk);

        // iii. If kPresent is true, then
        if (kPresent) {
          // 1. Let accumulator be ? Get(O, Pk).
          accumulator = Get(realm, O, Pk);
        }

        // iv. Decrease k by 1.
        k--;
      }

      // c. If kPresent is false, throw a TypeError exception.
      if (!kPresent || !accumulator) {
        throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError, "Array.prototype");
      }
    }

    // 9. Repeat, while k ≥ 0
    while (k >= 0) {
      // a. Let Pk be ! ToString(k).
      let Pk = new StringValue(realm, k + "");

      // b. Let kPresent be ? HasProperty(O, Pk).
      let kPresent = HasProperty(realm, O, Pk);

      // c. If kPresent is true, then
      if (kPresent) {
        // i. Let kValue be ? Get(O, Pk).
        let kValue = Get(realm, O, Pk);

        // ii. Let accumulator be ? Call(callbackfn, undefined, « accumulator, kValue, k, O »).
        accumulator = Call(realm, callbackfn, realm.intrinsics.undefined, [
          accumulator,
          kValue,
          new NumberValue(realm, k),
          O,
        ]);
      }

      // d. Decrease k by 1.
      k--;
    }

    // 10. Return accumulator.
    return accumulator;
  });

  // ECMA262 22.2.3.21
  obj.defineNativeMethod("reverse", 0, context => {
    // 1. Let O be ? ToObject(this value).
    let O = To.ToObject(realm, context);

    // 2. Perform ? ValidateTypedArray(O).
    ValidateTypedArray(realm, O);

    // 3. Let len be O.[[ArrayLength]].
    let len = O.throwIfNotConcreteObject().$ArrayLength;
    invariant(typeof len === "number");

    // 4. Let middle be floor(len/2).
    let middle = Math.floor(len / 2);

    // 5. Let lower be 0.
    let lower = 0;

    // 6. Repeat, while lower ≠ middle
    while (lower !== middle) {
      // a. Let upper be len - lower - 1.
      let upper = len - lower - 1;

      // b. Let upperP be ! ToString(upper).
      let upperP = new StringValue(realm, upper + "");

      // c. Let lowerP be ! ToString(lower).
      let lowerP = new StringValue(realm, lower + "");

      // d. Let lowerExists be ? HasProperty(O, lowerP).
      let lowerExists = HasProperty(realm, O, lowerP);

      // e. If lowerExists is true, then
      let lowerValue;
      if (lowerExists) {
        // i. Let lowerValue be ? Get(O, lowerP).
        lowerValue = Get(realm, O, lowerP);
      }

      // f. Let upperExists be ? HasProperty(O, upperP).
      let upperExists = HasProperty(realm, O, upperP);

      // g. If upperExists is true, then
      let upperValue;
      if (upperExists) {
        // i. Let upperValue be ? Get(O, upperP).
        upperValue = Get(realm, O, upperP);
      }

      // h. If lowerExists is true and upperExists is true, then
      if (lowerExists && upperExists) {
        invariant(lowerValue, "expected lower value to exist");
        invariant(upperValue, "expected upper value to exist");

        // i. Perform ? Set(O, lowerP, upperValue, true).
        Properties.Set(realm, O, lowerP, upperValue, true);

        // ii. Perform ? Set(O, upperP, lowerValue, true).
        Properties.Set(realm, O, upperP, lowerValue, true);
      } else if (!lowerExists && upperExists) {
        // i. Else if lowerExists is false and upperExists is true, then
        invariant(upperValue, "expected upper value to exist");

        // i. Perform ? Set(O, lowerP, upperValue, true).
        Properties.Set(realm, O, lowerP, upperValue, true);

        // ii. Perform ? DeletePropertyOrThrow(O, upperP).
        Properties.DeletePropertyOrThrow(realm, O.throwIfNotConcreteObject(), upperP);
      } else if (lowerExists && !upperExists) {
        // j. Else if lowerExists is true and upperExists is false, then
        invariant(lowerValue, "expected lower value to exist");

        // i. Perform ? DeletePropertyOrThrow(O, lowerP).
        Properties.DeletePropertyOrThrow(realm, O.throwIfNotConcreteObject(), lowerP);

        // ii. Perform ? Set(O, upperP, lowerValue, true).
        Properties.Set(realm, O, upperP, lowerValue, true);
      } else {
        // k. Else both lowerExists and upperExists are false,
        // i. No action is required.
      }

      // l. Increase lower by 1.
      lower++;
    }

    // 7. Return O.
    return O;
  });

  // ECMA262 22.2.3.23
  obj.defineNativeMethod("set", 1, (context, [overloaded, offset]) => {
    if (overloaded.$TypedArrayName === undefined) {
      let array = overloaded;

      // 1. Assert: array is any ECMAScript language value other than an Object with a [[TypedArrayName]] internal slot. If it is such an Object, the definition in 22.2.3.23.2 applies.
      invariant(!(overloaded instanceof ObjectValue && overloaded.$TypedArrayName));

      // 2. Let target be the this value.
      let target = context.throwIfNotConcrete();

      // 3. If Type(target) is not Object, throw a TypeError exception.
      if (!(target instanceof ObjectValue)) {
        throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError, "Type(target) is not Object");
      }

      // 4. If target does not have a [[TypedArrayName]] internal slot, throw a TypeError exception.
      if (typeof target.$TypedArrayName !== "string") {
        throw realm.createErrorThrowCompletion(
          realm.intrinsics.TypeError,
          "target does not have a [[TypedArrayName]] internal slot"
        );
      }

      // 5. Assert: target has a [[ViewedArrayBuffer]] internal slot.
      invariant(target.$ViewedArrayBuffer, "target has a [[ViewedArrayBuffer]] internal slot");

      // 6. Let targetOffset be ? ToInteger(offset).
      let targetOffset = To.ToInteger(realm, offset || realm.intrinsics.undefined);

      // 7. If targetOffset < 0, throw a RangeError exception.
      if (targetOffset < 0) {
        throw realm.createErrorThrowCompletion(realm.intrinsics.RangeError, "targetOffset < 0");
      }

      // 8. Let targetBuffer be target.[[ViewedArrayBuffer]].
      let targetBuffer = target.$ViewedArrayBuffer;
      invariant(targetBuffer instanceof ObjectValue);

      // 9. If IsDetachedBuffer(targetBuffer) is true, throw a TypeError exception.
      if (IsDetachedBuffer(realm, targetBuffer) === true) {
        throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError, "IsDetachedBuffer(targetBuffer) is true");
      }

      // 10. Let targetLength be target.[[ArrayLength]].
      let targetLength = target.$ArrayLength;
      invariant(typeof targetLength === "number");

      // 11. Let targetName be the String value of target.[[TypedArrayName]].
      let targetName = target.$TypedArrayName;
      invariant(typeof targetName === "string");

      // 12. Let targetElementSize be the Number value of the Element Size value specified in Table 50 for targetName.
      let targetElementSize = ArrayElementSize[targetName];

      // 13. Let targetType be the String value of the Element Type value in Table 50 for targetName.
      let targetType = ArrayElementType[targetName];

      // 14. Let targetByteOffset be target.[[ByteOffset]].
      let targetByteOffset = target.$ByteOffset;
      invariant(typeof targetByteOffset === "number");

      // 15. Let src be ? ToObject(array).
      let src = To.ToObject(realm, array);

      // 16. Let srcLength be ? ToLength(? Get(src, "length")).
      let srcLength = To.ToLength(realm, Get(realm, src, "length"));

      // 17. If srcLength + targetOffset > targetLength, throw a RangeError exception.
      if (srcLength + targetOffset > targetLength) {
        throw realm.createErrorThrowCompletion(realm.intrinsics.RangeError, "srcLength + targetOffset > targetLength");
      }

      // 18. Let targetByteIndex be targetOffset × targetElementSize + targetByteOffset.
      let targetByteIndex = targetOffset * targetElementSize + targetByteOffset;

      // 19. Let k be 0.
      let k = 0;

      // 20. Let limit be targetByteIndex + targetElementSize × srcLength.
      let limit = targetByteIndex + targetElementSize * srcLength;

      // 21. Repeat, while targetByteIndex < limit
      while (targetByteIndex < limit) {
        // a. Let Pk be ! ToString(k).
        let Pk = To.ToString(realm, new NumberValue(realm, k));

        // b. Let kNumber be ? ToNumber(? Get(src, Pk)).
        let kNumber = To.ToNumber(realm, Get(realm, src, Pk));

        // c. If IsDetachedBuffer(targetBuffer) is true, throw a TypeError exception.
        if (IsDetachedBuffer(realm, targetBuffer) === true) {
          throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError, "IsDetachedBuffer(targetBuffer) is true");
        }

        // d. Perform SetValueInBuffer(targetBuffer, targetByteIndex, targetType, kNumber).
        SetValueInBuffer(realm, targetBuffer, targetByteIndex, targetType, kNumber);

        // e. Set k to k + 1.
        k = k + 1;

        // f. Set targetByteIndex to targetByteIndex + targetElementSize.
        targetByteIndex = targetByteIndex + targetElementSize;
      }

      // 22. Return undefined.
      return realm.intrinsics.undefined;
    } else {
      let typedArray = overloaded;

      // 1. Assert: typedArray has a [[TypedArrayName]] internal slot. If it does not, the definition in 22.2.3.23.1 applies.
      invariant(typedArray instanceof ObjectValue && typedArray.$TypedArrayName);

      // 2. Let target be the this value.
      let target = context.throwIfNotConcrete();

      // 3. If Type(target) is not Object, throw a TypeError exception.
      if (!(target instanceof ObjectValue)) {
        throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError, "Type(target) is not Object");
      }

      // 4. If target does not have a [[TypedArrayName]] internal slot, throw a TypeError exception.
      if (typeof target.$TypedArrayName !== "string") {
        throw realm.createErrorThrowCompletion(
          realm.intrinsics.TypeError,
          "target does not have a [[TypedArrayName]] internal slot"
        );
      }

      // 5. Assert: target has a [[ViewedArrayBuffer]] internal slot.
      invariant(target.$ViewedArrayBuffer);

      // 6. Let targetOffset be ? ToInteger(offset).
      let targetOffset = To.ToInteger(realm, offset || realm.intrinsics.undefined);

      // 7. If targetOffset < 0, throw a RangeError exception.
      if (targetOffset < 0) {
        throw realm.createErrorThrowCompletion(realm.intrinsics.RangeError, "targetOffset < 0");
      }

      // 8. Let targetBuffer be target.[[ViewedArrayBuffer]].
      let targetBuffer = target.$ViewedArrayBuffer;
      invariant(targetBuffer instanceof ObjectValue);

      // 9. If IsDetachedBuffer(targetBuffer) is true, throw a TypeError exception.
      if (IsDetachedBuffer(realm, targetBuffer) === true) {
        throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError, "IsDetachedBuffer(targetBuffer) is true");
      }

      // 10. Let targetLength be target.[[ArrayLength]].
      let targetLength = target.$ArrayLength;
      invariant(typeof targetLength === "number");

      // 11. Let srcBuffer be typedArray.[[ViewedArrayBuffer]].
      let srcBuffer = typedArray.$ViewedArrayBuffer;
      invariant(srcBuffer);

      // 12. If IsDetachedBuffer(srcBuffer) is true, throw a TypeError exception.
      if (IsDetachedBuffer(realm, srcBuffer) === true) {
        throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError, "IsDetachedBuffer(srcBuffer) is true");
      }

      // 13. Let targetName be the String value of target.[[TypedArrayName]].
      let targetName = target.$TypedArrayName;
      invariant(typeof targetName === "string");

      // 14. Let targetType be the String value of the Element Type value in Table 50 for targetName.
      let targetType = ArrayElementType[targetName];

      // 15. Let targetElementSize be the Number value of the Element Size value specified in Table 50 for targetName.
      let targetElementSize = ArrayElementSize[targetName];

      // 16. Let targetByteOffset be target.[[ByteOffset]].
      let targetByteOffset = target.$ByteOffset;
      invariant(typeof targetByteOffset === "number");

      // 17. Let srcName be the String value of typedArray.[[TypedArrayName]].
      let srcName = typedArray.$TypedArrayName;
      invariant(typeof srcName === "string");

      // 18. Let srcType be the String value of the Element Type value in Table 50 for srcName.
      let srcType = ArrayElementType[srcName];

      // 19. Let srcElementSize be the Number value of the Element Size value specified in Table 50 for srcName.
      let srcElementSize = ArrayElementSize[srcName];

      // 20. Let srcLength be typedArray.[[ArrayLength]].
      let srcLength = typedArray.$ArrayLength;
      invariant(typeof srcLength === "number");

      // 21. Let srcByteOffset be typedArray.[[ByteOffset]].
      let srcByteOffset = typedArray.$ByteOffset;
      invariant(typeof srcByteOffset === "number");

      // 22. If srcLength + targetOffset > targetLength, throw a RangeError exception.
      if (srcLength + targetOffset > targetLength) {
        throw realm.createErrorThrowCompletion(realm.intrinsics.RangeError, "srcLength + targetOffset > targetLength");
      }

      let srcByteIndex;
      // 23. If SameValue(srcBuffer, targetBuffer) is true, then
      if (SameValue(realm, srcBuffer, targetBuffer) === true) {
        // a. Let srcBuffer be ? CloneArrayBuffer(targetBuffer, srcByteOffset, %ArrayBuffer%).
        srcBuffer = CloneArrayBuffer(realm, targetBuffer, srcByteOffset, realm.intrinsics.ArrayBuffer);

        // b. NOTE: %ArrayBuffer% is used to clone srcBuffer because is it known to not have any observable side-effects.

        // c. Let srcByteIndex be 0.
        srcByteIndex = 0;
      } else {
        // 24. Else, let srcByteIndex be srcByteOffset.
        srcByteIndex = srcByteOffset;
      }

      // 25. Let targetByteIndex be targetOffset × targetElementSize + targetByteOffset.
      let targetByteIndex = targetOffset * targetElementSize + targetByteOffset;

      // 26. Let limit be targetByteIndex + targetElementSize × srcLength.
      let limit = targetByteIndex + targetElementSize * srcLength;

      // 27. If SameValue(srcType, targetType) is true, then
      if (srcType === targetType) {
        // a. NOTE: If srcType and targetType are the same, the transfer must be performed in a manner that preserves the bit-level encoding of the source data.

        // b. Repeat, while targetByteIndex < limit
        while (targetByteIndex < limit) {
          // i. Let value be GetValueFromBuffer(srcBuffer, srcByteIndex, "Uint8").
          let value = GetValueFromBuffer(realm, srcBuffer, srcByteIndex, "Uint8");

          // ii. Perform SetValueInBuffer(targetBuffer, targetByteIndex, "Uint8", value).
          SetValueInBuffer(realm, targetBuffer, targetByteIndex, "Uint8", value.value);

          // iii. Set srcByteIndex to srcByteIndex + 1.
          srcByteIndex += 1;

          // iv. Set targetByteIndex to targetByteIndex + 1.
          targetByteIndex += 1;
        }
      } else {
        // 28. Else,
        // a. Repeat, while targetByteIndex < limit
        while (targetByteIndex < limit) {
          // i. Let value be GetValueFromBuffer(srcBuffer, srcByteIndex, srcType).
          let value = GetValueFromBuffer(realm, srcBuffer, srcByteIndex, srcType);

          // ii. Perform SetValueInBuffer(targetBuffer, targetByteIndex, targetType, value).
          SetValueInBuffer(realm, targetBuffer, targetByteIndex, targetType, value.value);

          // iii. Set srcByteIndex to srcByteIndex + srcElementSize.
          srcByteIndex = srcByteIndex + srcElementSize;

          // iv. Set targetByteIndex to targetByteIndex + targetElementSize.
          targetByteIndex = targetByteIndex + targetElementSize;
        }
      }

      // 29. Return undefined.
      return realm.intrinsics.undefined;
    }
  });

  // ECMA262 22.2.3.24
  obj.defineNativeMethod("slice", 2, (context, [start, end]) => {
    // 1. Let O be the this value.
    let O = context;

    // 2. Perform ? ValidateTypedArray(O).
    ValidateTypedArray(realm, O);
    invariant(O instanceof ObjectValue);

    // 3. Let len be O.[[ArrayLength]].
    let len = O.$ArrayLength;
    invariant(typeof len === "number");

    // 4. Let relativeStart be ? ToInteger(start).
    let relativeStart = To.ToInteger(realm, start);

    // 5. If relativeStart < 0, let k be max((len + relativeStart), 0); else let k be min(relativeStart, len).
    let k = relativeStart < 0 ? Math.max(len + relativeStart, 0) : Math.min(relativeStart, len);

    // 6. If end is undefined, let relativeEnd be len; else let relativeEnd be ? ToInteger(end).
    let relativeEnd = !end || end instanceof UndefinedValue ? len : To.ToInteger(realm, end.throwIfNotConcrete());

    // 7. If relativeEnd < 0, let final be max((len + relativeEnd), 0); else let final be min(relativeEnd, len).
    let final = relativeEnd < 0 ? Math.max(len + relativeEnd, 0) : Math.min(relativeEnd, len);

    // 8. Let count be max(final - k, 0).
    let count = Math.max(final - k, 0);

    // 9. Let A be ? TypedArraySpeciesCreate(O, « count »).
    let A = TypedArraySpeciesCreate(realm, O, [new NumberValue(realm, count)]);

    // 10. Let srcName be the String value of O.[[TypedArrayName]].
    let srcName = O.$TypedArrayName;
    invariant(typeof srcName === "string");

    // 11. Let srcType be the String value of the Element Type value in Table 50 for srcName.
    let srcType = ArrayElementType[srcName];

    // 12. Let targetName be the String value of A.[[TypedArrayName]].
    let targetName = A.$TypedArrayName;
    invariant(typeof targetName === "string");

    // 13. Let targetType be the String value of the Element Type value in Table 50 for targetName.
    let targetType = ArrayElementType[targetName];

    // 14. If SameValue(srcType, targetType) is false, then
    if (srcType !== targetType) {
      // a. Let n be 0.
      let n = 0;

      // b. Repeat, while k < final
      while (k < final) {
        // i. Let Pk be ! ToString(k).
        let Pk = To.ToString(realm, new NumberValue(realm, k));

        // ii. Let kValue be ? Get(O, Pk).
        let kValue = Get(realm, O, Pk);

        // iii. Perform ! Set(A, ! ToString(n), kValue).
        Properties.Set(realm, A, To.ToString(realm, new NumberValue(realm, n)), kValue, true);

        // iv. Increase k by 1.
        k += 1;

        // v. Increase n by 1.
        n += 1;
      }
    } else if (count > 0) {
      // 15. Else if count > 0, then
      // a. Let srcBuffer be O.[[ViewedArrayBuffer]].
      let srcBuffer = O.$ViewedArrayBuffer;
      invariant(srcBuffer);

      // b. If IsDetachedBuffer(srcBuffer) is true, throw a TypeError exception.
      if (IsDetachedBuffer(realm, srcBuffer) === true) {
        throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError, "IsDetachedBuffer(srcBuffer) is true");
      }

      // c. Let targetBuffer be A.[[ViewedArrayBuffer]].
      let targetBuffer = A.$ViewedArrayBuffer;
      invariant(targetBuffer instanceof ObjectValue);

      // d. Let elementSize be the Number value of the Element Size value specified in Table 50 for srcType.
      let elementSize = ElementSize[srcType];

      // e. NOTE: If srcType and targetType are the same, the transfer must be performed in a manner that preserves the bit-level encoding of the source data.

      // f. Let srcByteOffset be O.[[ByteOffset]].
      let srcByteOffset = O.$ByteOffset;
      invariant(typeof srcByteOffset === "number");

      // g. Let targetByteIndex be A.[[ByteOffset]].
      let targetByteIndex = A.$ByteOffset;
      invariant(typeof targetByteIndex === "number");

      // h. Let srcByteIndex be (k × elementSize) + srcByteOffset.
      let srcByteIndex = k * elementSize + srcByteOffset;

      // i. Let limit be targetByteIndex + count × elementSize.
      let limit = targetByteIndex + count * elementSize;

      // j. Repeat, while targetByteIndex < limit
      while (targetByteIndex < limit) {
        // i. Let value be GetValueFromBuffer(srcBuffer, srcByteIndex, "Uint8").
        let value = GetValueFromBuffer(realm, srcBuffer, srcByteIndex, "Uint8");

        // ii. Perform SetValueInBuffer(targetBuffer, targetByteIndex, "Uint8", value).
        SetValueInBuffer(realm, targetBuffer, targetByteIndex, "Uint8", value.value);

        // iii. Increase srcByteIndex by 1.
        srcByteIndex += 1;

        // iv. Increase targetByteIndex by 1.
        targetByteIndex += 1;
      }
    }

    // 16. Return A.
    return A;
  });

  // ECMA262 22.2.3.25
  obj.defineNativeMethod("some", 1, (context, [callbackfn, thisArg]) => {
    // 1. Let O be ? ToObject(this value).
    let O = To.ToObject(realm, context);

    // 2. Perform ? ValidateTypedArray(O).
    ValidateTypedArray(realm, O);

    // 3. Let len be O.[[ArrayLength]].
    let len = O.throwIfNotConcreteObject().$ArrayLength;
    invariant(typeof len === "number");

    // 4. If IsCallable(callbackfn) is false, throw a TypeError exception.
    if (!IsCallable(realm, callbackfn)) {
      throw realm.createErrorThrowCompletion(
        realm.intrinsics.TypeError,
        "callback passed to Array.prototype.some isn't callable"
      );
    }

    // 5. If thisArg was supplied, let T be thisArg; else let T be undefined.
    let T = thisArg || realm.intrinsics.undefined;

    // 6. Let k be 0.
    let k = 0;

    // 7. Repeat, while k < len
    while (k < len) {
      // a. Let Pk be ! ToString(k).
      let Pk = new StringValue(realm, k + "");

      // b. Let kPresent be ? HasProperty(O, Pk).
      let kPresent = HasProperty(realm, O, Pk);

      // c. If kPresent is true, then
      if (kPresent) {
        // i. Let kValue be ? Get(O, Pk).
        let kValue = Get(realm, O, Pk);

        // ii. Let testResult be ToBoolean(? Call(callbackfn, T, « kValue, k, O »)).
        let testResult = To.ToBooleanPartial(realm, Call(realm, callbackfn, T, [kValue, new NumberValue(realm, k), O]));

        // iii. If testResult is true, return true.
        if (testResult) return realm.intrinsics.true;
      }

      // d. Increase k by 1.
      k++;
    }

    // 8. Return false.
    return realm.intrinsics.false;
  });

  // ECMA262 22.2.3.26
  obj.defineNativeMethod("sort", 1, (context, [comparefn]) => {
    // 1. Let obj be the this value.
    let O = To.ToObject(realm, context);

    // 2. Let buffer be ? ValidateTypedArray(obj).
    let buffer = ValidateTypedArray(realm, O);

    // 3. Let len be the value of obj's [[ArrayLength]] internal slot.
    let len = O.throwIfNotConcreteObject().$ArrayLength;
    invariant(typeof len === "number");

    // 22.2.3.26 Runtime Semantics: SortCompare( x, y )#
    let SortCompare = (x, y) => {
      // 1. Assert: Both Type(x) and Type(y) is Number.
      invariant(x instanceof NumberValue);
      invariant(y instanceof NumberValue);

      // 2. If the argument comparefn is not undefined, then
      if (!comparefn.mightBeUndefined()) {
        // a. Let v be ? Call(comparefn, undefined, « x, y »).
        let v = Call(realm, comparefn, realm.intrinsics.undefined, [x, y]);

        // b. If IsDetachedBuffer(buffer) is true, throw a TypeError exception.
        if (IsDetachedBuffer(realm, buffer) === true)
          throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError, "array buffer has been detached");

        // c. If v is NaN, return +0.
        if (v instanceof NumberValue && isNaN(v.value)) return realm.intrinsics.zero;

        // d. Return v.
        return v;
      }
      comparefn.throwIfNotConcrete();

      // If x and y are both NaN, return +0.
      // If x is NaN, return 1.
      if (isNaN(x.value)) {
        if (isNaN(y.value)) return realm.intrinsics.zero;
        return new NumberValue(realm, 1);
      }

      // If y is NaN, return -1.
      if (isNaN(y.value)) return new NumberValue(realm, -1);

      // If x < y, return -1.
      if (x.value < y.value) return new NumberValue(realm, -1);

      // If x > y, return 1.
      if (x.value > y.value) return new NumberValue(realm, +1);

      // If x is -0 and y is +0, return -1.
      if (Object.is(x.value, -0) && Object.is(y.value, +0)) return new NumberValue(realm, -1);

      // If x is +0 and y is -0, return 1.
      if (Object.is(x.value, +0) && Object.is(y.value, -0)) return new NumberValue(realm, 1);

      // Return +0.
      return realm.intrinsics.zero;
    };

    //1. Perform an implementation-dependent sequence of calls to the [[Get]] and [[Set]] internal methods of obj, to the DeletePropertyOrThrow and HasOwnProperty abstract operation with obj as the first argument, and to SortCompare (described below), such that:
    //   The property key argument for each call to [[Get]], [[Set]], HasOwnProperty, or DeletePropertyOrThrow is the string representation of a nonnegative integer less than len.

    // We leverage the underlying implementation sort by copying the element in a temp. array, sorting it, and
    // transfering back the value inside the our array.

    // We need to adapt the comparefn function to match the expected types
    let comparefn_ = (x, y) => {
      invariant(x instanceof NumberValue, "Unexpected type");
      invariant(y instanceof NumberValue, "Unexpected type");

      let result_ = SortCompare(x, y);
      let numb = To.ToNumber(realm, result_);
      return numb;
    };

    let arr = [];
    for (let j = 0; j < len; j++) {
      let val = IntegerIndexedElementGet(realm, O.throwIfNotConcreteObject(), j);
      arr[j] = val;
    }

    arr.sort(comparefn_);

    //Apply the permutation back to the original array.
    for (let j = 0; j < len; j++) {
      IntegerIndexedElementSet(realm, O.throwIfNotConcreteObject(), j, arr[j]);
    }

    // 2. Return obj;
    return context;
  });

  // ECMA262 22.2.3.27
  obj.defineNativeMethod("subarray", 2, (context, [begin, end]) => {
    // 1. Let O be the this value.
    let O = context.throwIfNotConcrete();

    // 2. If Type(O) is not Object, throw a TypeError exception.
    if (!(O instanceof ObjectValue)) {
      throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError, "Type(O) is not Object");
    }

    // 3. If O does not have a [[TypedArrayName]] internal slot, throw a TypeError exception.
    if (!("$TypedArrayName" in O)) {
      throw realm.createErrorThrowCompletion(
        realm.intrinsics.TypeError,
        "O does not have a [[TypedArrayName]] internal slot"
      );
    }

    // 4. Assert: O has a [[ViewedArrayBuffer]] internal slot.
    invariant(O.$ViewedArrayBuffer, "O has a [[ViewedArrayBuffer]] internal slot");

    // 5. Let buffer be O.[[ViewedArrayBuffer]].
    let buffer = O.$ViewedArrayBuffer;
    invariant(buffer);

    // 6. Let srcLength be O.[[ArrayLength]].
    let srcLength = O.$ArrayLength;
    invariant(typeof srcLength === "number");

    // 7. Let relativeBegin be ? ToInteger(begin).
    let relativeBegin = To.ToInteger(realm, begin);

    // 8. If relativeBegin < 0, let beginIndex be max((srcLength + relativeBegin), 0); else let beginIndex be min(relativeBegin, srcLength).
    let beginIndex = relativeBegin < 0 ? Math.max(srcLength + relativeBegin, 0) : Math.min(relativeBegin, srcLength);

    // 9. If end is undefined, let relativeEnd be srcLength; else, let relativeEnd be ? ToInteger(end).
    let relativeEnd = !end || end instanceof UndefinedValue ? srcLength : To.ToInteger(realm, end.throwIfNotConcrete());

    // 10. If relativeEnd < 0, let endIndex be max((srcLength + relativeEnd), 0); else let endIndex be min(relativeEnd, srcLength).
    let endIndex = relativeEnd < 0 ? Math.max(srcLength + relativeEnd, 0) : Math.min(relativeEnd, srcLength);

    // 11. Let newLength be max(endIndex - beginIndex, 0).
    let newLength = Math.max(endIndex - beginIndex, 0);

    // 12. Let constructorName be the String value of O.[[TypedArrayName]].
    let constructorName = O.$TypedArrayName;
    invariant(typeof constructorName === "string");

    // 13. Let elementSize be the Number value of the Element Size value specified in Table 50 for constructorName.
    let elementSize = ArrayElementSize[constructorName];

    // 14. Let srcByteOffset be O.[[ByteOffset]].
    let srcByteOffset = O.$ByteOffset;
    invariant(typeof srcByteOffset === "number");

    // 15. Let beginByteOffset be srcByteOffset + beginIndex × elementSize.
    let beginByteOffset = srcByteOffset + beginIndex * elementSize;

    // 16. Let argumentsList be « buffer, beginByteOffset, newLength ».
    let argumentsList = [buffer, new NumberValue(realm, beginByteOffset), new NumberValue(realm, newLength)];

    // 17. Return ? TypedArraySpeciesCreate(O, argumentsList).
    return TypedArraySpeciesCreate(realm, O, argumentsList);
  });

  // ECMA262 22.2.3.28
  obj.defineNativeMethod("toLocaleString", 0, context => {
    // 1. Let array be ? ToObject(this value).
    let array = To.ToObject(realm, context);

    // 2. Perform ? ValidateTypedArray(array).
    ValidateTypedArray(realm, array);

    // 3. Let len be array.[[ArrayLength]].
    let len = array.throwIfNotConcreteObject().$ArrayLength;
    invariant(typeof len === "number");

    // 4. Let separator be the String value for the list-separator String appropriate for the host environment's current locale (this is derived in an implementation-defined way).
    let separator = ",";

    // 5. If len is zero, return the empty String.
    if (len === 0) return realm.intrinsics.emptyString;

    // 6. Let firstElement be ? Get(array, "0").
    let firstElement = Get(realm, array, "0");

    // 7. If firstElement is undefined or null, then
    let R: ?string;
    if (HasSomeCompatibleType(firstElement, UndefinedValue, NullValue)) {
      // a. Let R be the empty String.
      R = "";
    } else {
      // 8. Else,
      // a. Let R be ? ToString(? Invoke(firstElement, "toLocaleString")).
      R = To.ToStringPartial(realm, Invoke(realm, firstElement, "toLocaleString"));
    }

    // 9. Let k be 1.
    let k = 1;

    // 10. Repeat, while k < len
    while (k < len) {
      // a. Let S be a String value produced by concatenating R and separator.
      let S: string = R + separator;

      // b. Let nextElement be ? Get(array, ! ToString(k)).
      let nextElement = Get(realm, array, new StringValue(realm, k + ""));

      // c. If nextElement is undefined or null, then
      if (HasSomeCompatibleType(nextElement, UndefinedValue, NullValue)) {
        // i. Let R be the empty String.
        R = "";
      } else {
        // d. Else,
        // i. Let R be ? ToString(? Invoke(nextElement, "toLocaleString")).
        R = To.ToStringPartial(realm, Invoke(realm, nextElement, "toLocaleString"));
      }

      // e. Let R be a String value produced by concatenating S and R.
      R = S + R;

      // f. Increase k by 1.
      k++;
    }

    // 11. Return R.
    return new StringValue(realm, R);
  });

  // ECMA262 22.2.3.29
  obj.defineNativeProperty("toString", realm.intrinsics.ArrayProto_toString);

  // ECMA262 22.2.3.30
  obj.defineNativeProperty("values", realm.intrinsics.TypedArrayProto_values);

  // ECMA262 22.2.3.31
  obj.defineNativeProperty(realm.intrinsics.SymbolIterator, realm.intrinsics.TypedArrayProto_values);

  // ECMA262 22.2.3.32
  obj.defineNativeGetter(realm.intrinsics.SymbolToStringTag, context => {
    // 1. Let O be the this value.
    let O = context.throwIfNotConcrete();

    // 2. If Type(O) is not Object, return undefined.
    if (!(O instanceof ObjectValue)) return realm.intrinsics.undefined;

    // 3. If O does not have a [[TypedArrayName]] internal slot, return undefined.
    if (!("$TypedArrayName" in O)) return realm.intrinsics.undefined;

    // 4. Let name be O.[[TypedArrayName]].
    let name = O.$TypedArrayName;

    // 5. Assert: name is a String value.
    invariant(typeof name === "string", "name is a String value");

    // 6. Return name.
    return new StringValue(realm, name);
  });
}

export function build(realm: Realm, obj: ObjectValue, type: ElementType): void {
  // ECMA262 22.2.6
  obj.$Prototype = realm.intrinsics.TypedArrayPrototype;

  // ECMA262 22.2.6.1
  obj.defineNativeConstant("BYTES_PER_ELEMENT", new NumberValue(realm, ElementSize[type]));
}
