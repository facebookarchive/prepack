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
  AbstractValue,
  ArrayValue,
  BooleanValue,
  BoundFunctionValue,
  ConcreteValue,
  ECMAScriptSourceFunctionValue,
  NativeFunctionValue,
  NullValue,
  NumberValue,
  ObjectValue,
  StringValue,
  UndefinedValue,
  Value,
} from "../../values/index.js";
import invariant from "../../invariant.js";
import { SameValueZeroPartial, AbstractRelationalComparison } from "../../methods/abstract.js";
import {
  StrictEqualityComparisonPartial,
  IsCallable,
  IsConcatSpreadable,
  IsExtensible,
  HasOwnProperty,
  HasProperty,
  Call,
  Invoke,
  Get,
  HasSomeCompatibleType,
} from "../../methods/index.js";
import { Create, Join, Properties, To } from "../../singletons.js";
import { createOperationDescriptor } from "../../utils/generator.js";

export default function(realm: Realm, obj: ObjectValue): void {
  // ECMA262 22.1.3.31
  obj.defineNativeProperty(realm.intrinsics.SymbolIterator, realm.intrinsics.ArrayProto_values);

  // ECMA262 22.1.3
  obj.defineNativeProperty("length", realm.intrinsics.zero);

  // ECMA262 22.1.3.1
  obj.defineNativeMethod("concat", 1, (context, args, argCount) => {
    // 1. Let O be ? ToObject(this value).
    let O = To.ToObject(realm, context);

    if (
      ArrayValue.isIntrinsicAndHasWidenedNumericProperty(O) &&
      realm.isInPureScope() &&
      O.$GetOwnProperty("concat") === undefined
    ) {
      let newArgs = [O, new StringValue(realm, "concat"), ...args];
      return ArrayValue.createTemporalWithWidenedNumericProperty(
        realm,
        newArgs,
        createOperationDescriptor("UNKNOWN_ARRAY_METHOD_PROPERTY_CALL")
      );
    }

    // 2. Let A be ? ArraySpeciesCreate(O, 0).
    let A = Create.ArraySpeciesCreate(realm, O.throwIfNotConcreteObject(), 0);

    // 3. Let n be 0.
    let n = 0;

    // 4. Let items be a List whose first element is O and whose subsequent elements are, in left to right
    //    order, the arguments that were passed to this function invocation.
    let items = argCount === 0 ? [O] : [O, ...args];

    // 5. Repeat, while items is not empty
    while (items.length) {
      // a. Remove the first element from items and let E be the value of the element.
      let E = items.shift();

      // b. Let spreadable be ? IsConcatSpreadable(E).
      let spreadable = IsConcatSpreadable(realm, E);

      // c. If spreadable is true, then
      if (spreadable) {
        E = E.throwIfNotConcreteObject();

        // i. Let k be 0.
        let k = 0;

        // ii. Let len be ? ToLength(? Get(E, "length")).
        let len = To.ToLength(realm, Get(realm, E, "length"));

        // ii. If n + len > 2^53-1, throw a TypeError exception.
        if (n + len > Math.pow(2, 53) - 1) {
          throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError, "too damn high");
        }

        // iv. Repeat, while k < len
        while (k < len) {
          // 1. Let P be ! ToString(k).
          let P = new StringValue(realm, k + "");

          // 2. Let exists be ? HasProperty(E, P).
          let exists = HasProperty(realm, E, P);

          // 3. If exists is true, then
          if (exists) {
            // a. Let subElement be ? Get(E, P).
            let subElement = Get(realm, E, P);

            // b. Perform ? CreateDataPropertyOrThrow(A, ! ToString(n), subElement).
            Create.CreateDataPropertyOrThrow(realm, A, new StringValue(realm, n + ""), subElement);
          }

          // 4. Increase n by 1.
          n++;

          // 5. Increase k by 1.
          k++;
        }
      } else {
        // d. Else E is added as a single item rather than spread,
        // i. If n≥2^53-1, throw a TypeError exception.
        if (n > Math.pow(2, 53) - 1) {
          throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError, "too damn high");
        }

        // ii. Perform ? CreateDataPropertyOrThrow(A, ! ToString(n), E).
        Create.CreateDataPropertyOrThrow(realm, A, new StringValue(realm, n + ""), E);

        // iii. Increase n by 1.
        n++;
      }
    }

    // 6. Perform ? Set(A, "length", n, true).
    Properties.Set(realm, A, "length", new NumberValue(realm, n), true);

    // 7. Return A.
    return A;
  });

  // ECMA262 22.1.3.3
  if (!realm.isCompatibleWith(realm.MOBILE_JSC_VERSION) && !realm.isCompatibleWith("mobile"))
    obj.defineNativeMethod("copyWithin", 2, (context, [target, start, end]) => {
      // 1. Let O be ? ToObject(this value).
      let O = To.ToObject(realm, context);

      // If we have an object that is an array with widened numeric properties, then
      // we can return a temporal here as we know nothing of the array's properties.
      // This should be safe to do, as we never expose the internals of the array.
      if (
        ArrayValue.isIntrinsicAndHasWidenedNumericProperty(O) &&
        realm.isInPureScope() &&
        O.$GetOwnProperty("copyWithin") === undefined
      ) {
        let args = [O, new StringValue(realm, "copyWithin"), target];
        if (start) {
          args.push(start);
        }
        if (end) {
          args.push(end);
        }
        AbstractValue.createTemporalFromBuildFunction(
          realm,
          BooleanValue,
          args,
          createOperationDescriptor("UNKNOWN_ARRAY_METHOD_PROPERTY_CALL")
        );
        return O;
      }

      // 2. Let len be ? ToLength(? Get(O, "length")).
      let len = To.ToLength(realm, Get(realm, O, "length"));

      // 3. Let relativeTarget be ? ToInteger(target).
      let relativeTarget = To.ToInteger(realm, target);

      // 4. If relativeTarget < 0, let to be max((len + relativeTarget), 0); else let to be min(relativeTarget, len).
      let to = relativeTarget < 0 ? Math.max(len + relativeTarget, 0) : Math.min(relativeTarget, len);

      // 5. Let relativeStart be ? ToInteger(start).
      let relativeStart = To.ToInteger(realm, start);

      // 6. If relativeStart < 0, let from be max((len + relativeStart), 0); else let from be min(relativeStart, len).
      let from = relativeStart < 0 ? Math.max(len + relativeStart, 0) : Math.min(relativeStart, len);

      // 7. If end is undefined, let relativeEnd be len; else let relativeEnd be ? ToInteger(end).
      let relativeEnd = !end || end instanceof UndefinedValue ? len : To.ToInteger(realm, end.throwIfNotConcrete());

      // 8. If relativeEnd < 0, let final be max((len + relativeEnd), 0); else let final be min(relativeEnd, len).
      let final = relativeEnd < 0 ? Math.max(len + relativeEnd, 0) : Math.min(relativeEnd, len);

      // 9. Let count be min(final-from, len-to).
      let count = Math.min(final - from, len - to);

      let direction;
      // 10. If from<to and to<from+count, then
      if (from < to && to < from + count) {
        // a. Let direction be -1.
        direction = -1;

        // b. Let from be from + count - 1.
        from = from + count - 1;

        // c. Let to be to + count - 1.
        to = to + count - 1;
      } else {
        // 11. Else,
        // a. Let direction be 1.
        direction = 1;
      }

      // 12. Repeat, while count > 0
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

      // 13. Return O.
      return O;
    });

  // ECMA262 22.1.3.4
  obj.defineNativeMethod("entries", 0, context => {
    // 1. Let O be ? ToObject(this value).
    let O = To.ToObject(realm, context);

    // If we have an object that is an array with widened numeric properties, then
    // we can return a temporal here as we know nothing of the array's properties.
    // This should be safe to do, as we never expose the internals of the array.
    if (
      ArrayValue.isIntrinsicAndHasWidenedNumericProperty(O) &&
      realm.isInPureScope() &&
      O.$GetOwnProperty("entries") === undefined
    ) {
      return AbstractValue.createTemporalFromBuildFunction(
        realm,
        Value,
        [O, new StringValue(realm, "entries")],
        createOperationDescriptor("UNKNOWN_ARRAY_METHOD_PROPERTY_CALL")
      );
    }

    // 2. Return CreateArrayIterator(O, "key+value").
    return Create.CreateArrayIterator(realm, O.throwIfNotConcreteObject(), "key+value");
  });

  // ECMA262 22.1.3.5
  obj.defineNativeMethod("every", 1, (context, [callbackfn, thisArg]) => {
    // 1. Let O be ? ToObject(this value).
    let O = To.ToObject(realm, context);

    // If we have an object that is an array with widened numeric properties, then
    // we can return a temporal here as we know nothing of the array's properties.
    // This should be safe to do, as we never expose the internals of the array.
    if (
      ArrayValue.isIntrinsicAndHasWidenedNumericProperty(O) &&
      realm.isInPureScope() &&
      O.$GetOwnProperty("every") === undefined
    ) {
      let args = [O, new StringValue(realm, "every"), callbackfn];
      if (thisArg) {
        args.push(thisArg);
      }
      return AbstractValue.createTemporalFromBuildFunction(
        realm,
        BooleanValue,
        args,
        createOperationDescriptor("UNKNOWN_ARRAY_METHOD_PROPERTY_CALL")
      );
    }

    // 2. Let len be ? ToLength(? Get(O, "length")).
    let len = To.ToLength(realm, Get(realm, O, "length"));

    // 3. If IsCallable(callbackfn) is false, throw a TypeError exception.
    if (!IsCallable(realm, callbackfn)) {
      throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError, "not a function");
    }

    // 4. If thisArg was supplied, let T be thisArg; else let T be undefined.
    let T = thisArg || realm.intrinsics.undefined;

    // 5. Let k be 0.
    let k = 0;

    // 6. Repeat, while k < len
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

    // 7. Return true.
    return realm.intrinsics.true;
  });

  // ECMA262 22.1.3.6
  obj.defineNativeMethod("fill", 1, (context, [value, start, end]) => {
    // 1. Let O be ? ToObject(this value).
    let O = To.ToObject(realm, context);

    // If we have an object that is an array with widened numeric properties, then
    // we can return a temporal here as we know nothing of the array's properties.
    // This should be safe to do, as we never expose the internals of the array.
    if (
      ArrayValue.isIntrinsicAndHasWidenedNumericProperty(O) &&
      realm.isInPureScope() &&
      O.$GetOwnProperty("fill") === undefined
    ) {
      let args = [O, new StringValue(realm, "fill"), value];
      if (start) {
        args.push(start);
      }
      if (end) {
        args.push(end);
      }
      AbstractValue.createTemporalFromBuildFunction(
        realm,
        Value,
        args,
        createOperationDescriptor("UNKNOWN_ARRAY_METHOD_PROPERTY_CALL")
      );
      return O;
    }

    // 2. Let len be ? ToLength(? Get(O, "length")).
    let len = To.ToLength(realm, Get(realm, O, "length"));

    // 3. Let relativeStart be ? ToInteger(start).
    let relativeStart = To.ToInteger(realm, start || realm.intrinsics.undefined);

    // 4. If relativeStart < 0, let k be max((len + relativeStart), 0); else let k be min(relativeStart, len).
    let k = relativeStart < 0 ? Math.max(len + relativeStart, 0) : Math.min(relativeStart, len);

    // 5. If end is undefined, let relativeEnd be len; else let relativeEnd be ? ToInteger(end).
    let relativeEnd = !end || end instanceof UndefinedValue ? len : To.ToInteger(realm, end.throwIfNotConcrete());

    // 6. If relativeEnd < 0, let final be max((len + relativeEnd), 0); else let final be min(relativeEnd, len).
    let final = relativeEnd < 0 ? Math.max(len + relativeEnd, 0) : Math.min(relativeEnd, len);

    // 7. Repeat, while k < final
    while (k < final) {
      // a. Let Pk be ! ToString(k).
      let Pk = new StringValue(realm, k + "");

      // b. Perform ? Set(O, Pk, value, true).
      Properties.Set(realm, O, Pk, value, true);

      // c. Increase k by 1.
      k++;
    }

    // 8. Return O.
    return O;
  });

  // ECMA262 22.1.3.7
  obj.defineNativeMethod("filter", 1, (context, [callbackfn, thisArg]) => {
    // 1. Let O be ? ToObject(this value).
    let O = To.ToObject(realm, context);

    if (
      ArrayValue.isIntrinsicAndHasWidenedNumericProperty(O) &&
      realm.isInPureScope() &&
      O.$GetOwnProperty("filter") === undefined
    ) {
      let args = [O, new StringValue(realm, "filter"), callbackfn];
      if (thisArg) {
        args.push(thisArg);
      }
      let possibleNestedOptimizedFunctions;

      // If callbackfn is a native function, it cannot be optimized, and cannot alias locations
      // other than ones accesible via global, which leaked value analysis disregards.
      if (!(callbackfn instanceof NativeFunctionValue)) {
        invariant(callbackfn instanceof ECMAScriptSourceFunctionValue || callbackfn instanceof BoundFunctionValue);
        possibleNestedOptimizedFunctions = [
          {
            func: callbackfn,
            thisValue: thisArg || realm.intrinsics.undefined,
            kind: "filter",
          },
        ];
      }
      return ArrayValue.createTemporalWithWidenedNumericProperty(
        realm,
        args,
        createOperationDescriptor("UNKNOWN_ARRAY_METHOD_PROPERTY_CALL"),
        possibleNestedOptimizedFunctions
      );
    }

    // 2. Let len be ? ToLength(? Get(O, "length")).
    let len = To.ToLength(realm, Get(realm, O, "length"));

    // 3. If IsCallable(callbackfn) is false, throw a TypeError exception.
    if (!IsCallable(realm, callbackfn)) {
      throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError, "not a function");
    }

    // 4. If thisArg was supplied, let T be thisArg; else let T be undefined.
    let T = thisArg || realm.intrinsics.undefined;

    // 5. Let A be ? ArraySpeciesCreate(O, 0).
    let A = Create.ArraySpeciesCreate(realm, O.throwIfNotConcreteObject(), 0);

    // 6. Let k be 0.
    let k = 0;

    // 7. Let to be 0.
    let to = 0;

    // 8. Repeat, while k < len
    while (k < len) {
      // a. Let Pk be ! ToString(k).
      let Pk = new StringValue(realm, k + "");

      // b. Let kPresent be ? HasProperty(O, Pk).
      let kPresent = HasProperty(realm, O, Pk);

      // c. If kPresent is true, then
      if (kPresent) {
        // i. Let kValue be ? Get(O, Pk).
        let kValue = Get(realm, O, Pk);

        // ii. Let selected be ToBoolean(? Call(callbackfn, T, « kValue, k, O »)).
        let selected = To.ToBooleanPartial(realm, Call(realm, callbackfn, T, [kValue, new NumberValue(realm, k), O]));

        // iii. If selected is true, then
        if (selected) {
          // 1. Perform ? CreateDataPropertyOrThrow(A, ! ToString(to), kValue).
          Create.CreateDataPropertyOrThrow(realm, A, To.ToString(realm, new NumberValue(realm, to)), kValue);

          // 2. Increase to by 1.
          to++;
        }
      }

      // d. Increase k by 1.
      k++;
    }

    // 9. Return A.
    return A;
  });

  // ECMA262 22.1.3.8
  obj.defineNativeMethod("find", 1, (context, [predicate, thisArg]) => {
    // 1. Let O be ? ToObject(this value).
    let O = To.ToObject(realm, context);

    // If we have an object that is an array with widened numeric properties, then
    // we can return a temporal here as we know nothing of the array's properties.
    // This should be safe to do, as we never expose the internals of the array.
    if (
      ArrayValue.isIntrinsicAndHasWidenedNumericProperty(O) &&
      realm.isInPureScope() &&
      O.$GetOwnProperty("find") === undefined
    ) {
      let args = [O, new StringValue(realm, "find"), predicate];
      if (thisArg) {
        args.push(thisArg);
      }
      return AbstractValue.createTemporalFromBuildFunction(
        realm,
        Value,
        args,
        createOperationDescriptor("UNKNOWN_ARRAY_METHOD_PROPERTY_CALL")
      );
    }

    // 2. Let len be ? ToLength(? Get(O, "length")).
    let len = To.ToLength(realm, Get(realm, O, "length"));

    // 3. If IsCallable(predicate) is false, throw a TypeError exception.
    if (!IsCallable(realm, predicate)) {
      throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError, "not a function");
    }

    // 4. If thisArg was supplied, let T be thisArg; else let T be undefined.
    let T = thisArg || realm.intrinsics.undefined;

    // 5. Let k be 0.
    let k = 0;

    // 6. Repeat, while k < len
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

    // 7. Return undefined.
    return realm.intrinsics.undefined;
  });

  // ECMA262 22.1.3.9
  obj.defineNativeMethod("findIndex", 1, (context, [predicate, thisArg]) => {
    // 1. Let O be ? ToObject(this value).
    let O = To.ToObject(realm, context);

    // If we have an object that is an array with widened numeric properties, then
    // we can return a temporal here as we know nothing of the array's properties.
    // This should be safe to do, as we never expose the internals of the array.
    if (
      ArrayValue.isIntrinsicAndHasWidenedNumericProperty(O) &&
      realm.isInPureScope() &&
      O.$GetOwnProperty("findIndex") === undefined
    ) {
      let args = [O, new StringValue(realm, "findIndex"), predicate];
      if (thisArg) {
        args.push(thisArg);
      }
      return AbstractValue.createTemporalFromBuildFunction(
        realm,
        NumberValue,
        args,
        createOperationDescriptor("UNKNOWN_ARRAY_METHOD_PROPERTY_CALL")
      );
    }

    // 2. Let len be ? ToLength(? Get(O, "length")).
    let len = To.ToLength(realm, Get(realm, O, "length"));

    // 3. If IsCallable(predicate) is false, throw a TypeError exception.
    if (IsCallable(realm, predicate) === false) {
      throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError, "not a function");
    }

    // 4. If thisArg was supplied, let T be thisArg; else let T be undefined.
    let T = thisArg ? thisArg : realm.intrinsics.undefined;

    // 5. Let k be 0.
    let k = 0;

    // 6. Repeat, while k < len
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

    // 7. Return -1.
    return new NumberValue(realm, -1);
  });

  // ECMA262 22.1.3.10
  obj.defineNativeMethod("forEach", 1, (context, [callbackfn, thisArg]) => {
    // 1. Let O be ? ToObject(this value).
    let O = To.ToObject(realm, context);

    // If we have an object that is an array with widened numeric properties, then
    // we can return a temporal here as we know nothing of the array's properties.
    // This should be safe to do, as we never expose the internals of the array.
    if (
      ArrayValue.isIntrinsicAndHasWidenedNumericProperty(O) &&
      realm.isInPureScope() &&
      O.$GetOwnProperty("forEach") === undefined
    ) {
      let args = [O, new StringValue(realm, "forEach"), callbackfn];
      if (thisArg) {
        args.push(thisArg);
      }
      AbstractValue.createTemporalFromBuildFunction(
        realm,
        BooleanValue,
        args,
        createOperationDescriptor("UNKNOWN_ARRAY_METHOD_PROPERTY_CALL")
      );
      return realm.intrinsics.undefined;
    }

    // 2. Let len be ? ToLength(? Get(O, "length")).
    let len = To.ToLength(realm, Get(realm, O, "length"));

    // 3. If IsCallable(callbackfn) is false, throw a TypeError exception.
    if (!IsCallable(realm, callbackfn)) {
      throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError, "not a function");
    }

    // 4. If thisArg was supplied, let T be thisArg; else let T be undefined.
    let T = thisArg || realm.intrinsics.undefined;

    // 5. Let k be 0.
    let k = 0;

    // 6. Repeat, while k < len
    while (k < len) {
      // a. Let Pk be ! To.ToString(k).
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

    // 7. Return undefined.
    return realm.intrinsics.undefined;
  });

  // ECMA262 22.1.3.11
  if (!realm.isCompatibleWith(realm.MOBILE_JSC_VERSION) && !realm.isCompatibleWith("mobile"))
    obj.defineNativeMethod("includes", 1, (context, [searchElement, fromIndex]) => {
      // 1. Let O be ? ToObject(this value).
      let O = To.ToObject(realm, context);

      // If we have an object that is an array with widened numeric properties, then
      // we can return a temporal here as we know nothing of the array's properties.
      // This should be safe to do, as we never expose the internals of the array.
      if (
        ArrayValue.isIntrinsicAndHasWidenedNumericProperty(O) &&
        realm.isInPureScope() &&
        O.$GetOwnProperty("includes") === undefined
      ) {
        let args = [O, new StringValue(realm, "includes"), searchElement];
        if (fromIndex) {
          args.push(fromIndex);
        }
        return AbstractValue.createTemporalFromBuildFunction(
          realm,
          BooleanValue,
          args,
          createOperationDescriptor("UNKNOWN_ARRAY_METHOD_PROPERTY_CALL")
        );
      }

      // 2. Let len be ? ToLength(? Get(O, "length")).
      let len = To.ToLength(realm, Get(realm, O, "length"));

      // 3. If len is 0, return false.
      if (len === 0) return realm.intrinsics.false;

      // 4. Let n be ? ToInteger(fromIndex). (If fromIndex is undefined, this step produces the value 0.)
      let n = To.ToInteger(realm, fromIndex || realm.intrinsics.undefined);

      let k;
      // 5. If n ≥ 0, then
      if (n >= 0) {
        // a. Let k be n.
        k = n;
      } else {
        // 6. Else n < 0,
        // a. Let k be len + n.
        k = len + n;
        // b. If k < 0, let k be 0.
        if (k < 0) k = 0;
      }

      // 7. Repeat, while k < len
      while (k < len) {
        // a. Let elementK be the result of ? Get(O, ! ToString(k)).
        let elementK = Get(realm, O, To.ToString(realm, new NumberValue(realm, k)));

        // b. If SameValueZero(searchElement, elementK) is true, return true.
        if (SameValueZeroPartial(realm, searchElement, elementK) === true) return realm.intrinsics.true;

        // c. Increase k by 1.
        k = k + 1;
      }

      // 8. Return false.
      return realm.intrinsics.false;
    });

  // ECMA262 22.1.3.12
  obj.defineNativeMethod("indexOf", 1, (context, [searchElement, fromIndex]) => {
    // 1. Let O be ? ToObject(this value).
    let O = To.ToObject(realm, context);

    // If we have an object that is an array with widened numeric properties, then
    // we can return a temporal here as we know nothing of the array's properties.
    // This should be safe to do, as we never expose the internals of the array.
    if (
      ArrayValue.isIntrinsicAndHasWidenedNumericProperty(O) &&
      realm.isInPureScope() &&
      O.$GetOwnProperty("indexOf") === undefined
    ) {
      let args = [O, new StringValue(realm, "indexOf"), searchElement];
      if (fromIndex) {
        args.push(fromIndex);
      }
      return AbstractValue.createTemporalFromBuildFunction(
        realm,
        NumberValue,
        args,
        createOperationDescriptor("UNKNOWN_ARRAY_METHOD_PROPERTY_CALL")
      );
    }

    // 2. Let len be ? ToLength(? Get(O, "length")).
    let len = To.ToLength(realm, Get(realm, O, "length"));

    // 3. If len is 0, return -1.
    if (len === 0) return new NumberValue(realm, -1);

    // 4. Let n be ? ToInteger(fromIndex). (If fromIndex is undefined, this step produces the value 0.)
    let n = fromIndex ? To.ToInteger(realm, fromIndex) : 0;

    // 5. If n ≥ len, return -1.
    if (n >= len) return new NumberValue(realm, -1);

    // 6. If n ≥ 0, then
    let k;
    if (n >= 0) {
      // a. If n is -0, let k be +0; else let k be n.
      k = Object.is(n, -0) ? +0 : n;
    } else {
      // 7. Else n < 0,
      // a. Let k be len + n.
      k = len + n;

      // b. If k < 0, let k be 0.
      if (k < 0) k = 0;
    }

    // 8. Repeat, while k < len
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

    // 9. Return -1.
    return new NumberValue(realm, -1);
  });

  // ECMA262 22.1.3.13
  obj.defineNativeMethod("join", 1, (context, [separator]) => {
    // 1. Let O be ? ToObject(this value).
    let O = To.ToObject(realm, context);

    // If we have an object that is an array with widened numeric properties, then
    // we can return a temporal here as we know nothing of the array's properties.
    // This should be safe to do, as we never expose the internals of the array.
    if (
      ArrayValue.isIntrinsicAndHasWidenedNumericProperty(O) &&
      realm.isInPureScope() &&
      O.$GetOwnProperty("join") === undefined
    ) {
      let args = [O, new StringValue(realm, "join")];
      if (separator) {
        args.push(separator);
      }
      return AbstractValue.createTemporalFromBuildFunction(
        realm,
        StringValue,
        args,
        createOperationDescriptor("UNKNOWN_ARRAY_METHOD_PROPERTY_CALL")
      );
    }

    // 2. Let len be ? ToLength(? Get(O, "length")).
    let len = To.ToLength(realm, Get(realm, O, "length"));

    // 3. If separator is undefined, let separator be the single-element String ",".
    if (!separator || separator instanceof UndefinedValue) separator = new StringValue(realm, ",");

    // 4. Let sep be ? ToString(separator).
    let sep = To.ToStringPartial(realm, separator);

    // 5. If len is zero, return the empty String.
    if (len === 0) return realm.intrinsics.emptyString;

    // 6. Let element0 be Get(O, "0").
    let element0 = Get(realm, O, "0");

    // 7. If element0 is undefined or null, let R be the empty String; otherwise, let R be ? ToString(element0).
    let R: ?string;
    if (HasSomeCompatibleType(element0, UndefinedValue, NullValue)) {
      R = "";
    } else {
      R = To.ToStringPartial(realm, element0);
    }

    // 8. Let k be 1.
    let k = 1;

    // 9. Repeat, while k < len
    while (k < len) {
      // a. Let S be the String value produced by concatenating R and sep.
      let S: string = R + sep;

      // b. Let element be ? Get(O, ! To.ToString(k)).
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

    // 10. Return R.
    return new StringValue(realm, R + "");
  });

  // ECMA262 22.1.3.14
  obj.defineNativeMethod("keys", 0, context => {
    // 1. Let O be ? ToObject(this value).
    let O = To.ToObject(realm, context);

    // If we have an object that is an array with widened numeric properties, then
    // we can return a temporal here as we know nothing of the array's properties.
    // This should be safe to do, as we never expose the internals of the array.
    if (
      ArrayValue.isIntrinsicAndHasWidenedNumericProperty(O) &&
      realm.isInPureScope() &&
      O.$GetOwnProperty("keys") === undefined
    ) {
      return AbstractValue.createTemporalFromBuildFunction(
        realm,
        Value,
        [O, new StringValue(realm, "keys")],
        createOperationDescriptor("UNKNOWN_ARRAY_METHOD_PROPERTY_CALL")
      );
    }

    // 2. Return CreateArrayIterator(O, "key").
    return Create.CreateArrayIterator(realm, O.throwIfNotConcreteObject(), "key");
  });

  // ECMA262 22.1.3.15
  obj.defineNativeMethod("lastIndexOf", 1, (context, [searchElement, fromIndex]) => {
    // 1. Let O be ? ToObject(this value).
    let O = To.ToObject(realm, context);

    // If we have an object that is an array with widened numeric properties, then
    // we can return a temporal here as we know nothing of the array's properties.
    // This should be safe to do, as we never expose the internals of the array.
    if (
      ArrayValue.isIntrinsicAndHasWidenedNumericProperty(O) &&
      realm.isInPureScope() &&
      O.$GetOwnProperty("lastIndexOf") === undefined
    ) {
      let args = [O, new StringValue(realm, "lastIndexOf"), searchElement];
      if (fromIndex) {
        args.push(fromIndex);
      }
      return AbstractValue.createTemporalFromBuildFunction(
        realm,
        NumberValue,
        args,
        createOperationDescriptor("UNKNOWN_ARRAY_METHOD_PROPERTY_CALL")
      );
    }

    // 2. Let len be ? ToLength(? Get(O, "length")).
    let len = To.ToLength(realm, Get(realm, O, "length"));

    // 3. If len is 0, return -1.
    if (len === 0) return new NumberValue(realm, -1);

    // 4. If argument fromIndex was passed, let n be ? ToInteger(fromIndex); else let n be len-1.
    let n = fromIndex ? To.ToInteger(realm, fromIndex) : len - 1;

    // 5. If n ≥ 0, then
    let k;
    if (n >= 0) {
      // a. If n is -0, let k be +0; else let k be min(n, len - 1).
      k = Object.is(n, -0) ? +0 : Math.min(n, len - 1);
    } else {
      // 6. Else n < 0,
      // a. Let k be len + n.
      k = len + n;
    }

    // 7. Repeat, while k ≥ 0
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

    // 8. Return -1.
    return new NumberValue(realm, -1);
  });

  // ECMA262 22.1.3.16
  obj.defineNativeMethod("map", 1, (context, [callbackfn, thisArg]) => {
    // 1. Let O be ? ToObject(this value).
    let O = To.ToObject(realm, context);

    if (
      ArrayValue.isIntrinsicAndHasWidenedNumericProperty(O) &&
      realm.isInPureScope() &&
      O.$GetOwnProperty("map") === undefined
    ) {
      let args = [O, new StringValue(realm, "map"), callbackfn];
      if (thisArg) {
        args.push(thisArg);
      }
      invariant(callbackfn instanceof ECMAScriptSourceFunctionValue || callbackfn instanceof BoundFunctionValue);
      let possibleNestedOptimizedFunctions = [
        { func: callbackfn, thisValue: thisArg || realm.intrinsics.undefined, kind: "map" },
      ];
      return ArrayValue.createTemporalWithWidenedNumericProperty(
        realm,
        args,
        createOperationDescriptor("UNKNOWN_ARRAY_METHOD_PROPERTY_CALL"),
        possibleNestedOptimizedFunctions
      );
    }

    // 2. Let len be ? ToLength(? Get(O, "length")).
    let lenVal = Get(realm, O, "length");
    if (lenVal instanceof AbstractValue && !lenVal.mightNotBeNumber() && !lenVal.values.isTop()) {
      let values = lenVal.values.getElements();
      let n = values.size;
      if (n > 1 && n < 10) {
        let a = Create.ArraySpeciesCreate(realm, O.throwIfNotConcreteObject(), 0);
        return Join.mapAndJoin(
          realm,
          values,
          v => AbstractValue.createFromBinaryOp(realm, "===", v, lenVal, lenVal.expressionLocation),
          v => doMap(v, a)
        );
      }
    }
    return doMap(lenVal.throwIfNotConcrete());

    function doMap(val: ConcreteValue, resultArray?: ObjectValue) {
      let len = To.ToLength(realm, val);

      // 3. If IsCallable(callbackfn) is false, throw a TypeError exception.
      if (!IsCallable(realm, callbackfn)) {
        throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError, "not a function");
      }

      // 4. If thisArg was supplied, let T be thisArg; else let T be undefined.
      let T = thisArg || realm.intrinsics.undefined;

      // 5. Let A be ? ArraySpeciesCreate(O, len).
      let A;
      if (resultArray === undefined) A = Create.ArraySpeciesCreate(realm, O.throwIfNotConcreteObject(), len);
      else {
        A = resultArray;
        Properties.Set(realm, A, "length", val, true);
      }

      // 6. Let k be 0.
      let k = 0;

      // 7. Repeat, while k < len
      while (k < len) {
        // a. Let Pk be ! To.ToString(k).
        let Pk = new StringValue(realm, k + "");

        // b. Let kPresent be ? HasProperty(O, Pk).
        let kPresent = HasProperty(realm, O, Pk);

        // c. If kPresent is true, then
        if (kPresent) {
          // i. Let kValue be ? Get(O, Pk).
          let kValue = Get(realm, O, Pk);

          // ii. Let mappedValue be ? Call(callbackfn, T, « kValue, k, O »).
          let mappedValue = Call(realm, callbackfn, T, [kValue, new NumberValue(realm, k), O]);

          // iii. Perform ? CreateDataPropertyOrThrow(A, Pk, mappedValue).
          Create.CreateDataPropertyOrThrow(realm, A, Pk, mappedValue);
        }

        // d. Increase k by 1.
        k++;
      }

      // 8. Return A.
      return A;
    }
  });

  // ECMA262 22.1.3.17
  obj.defineNativeMethod("pop", 0, context => {
    // 1. Let O be ? ToObject(this value).
    let O = To.ToObject(realm, context);

    // If we have an object that is an array with widened numeric properties, then
    // we can return a temporal here as we know nothing of the array's properties.
    // This should be safe to do, as we never expose the internals of the array.
    if (
      ArrayValue.isIntrinsicAndHasWidenedNumericProperty(O) &&
      realm.isInPureScope() &&
      O.$GetOwnProperty("pop") === undefined
    ) {
      return AbstractValue.createTemporalFromBuildFunction(
        realm,
        Value,
        [O, new StringValue(realm, "pop")],
        createOperationDescriptor("UNKNOWN_ARRAY_METHOD_PROPERTY_CALL")
      );
    }

    // 2. Let len be ? ToLength(? Get(O, "length")).
    let len = To.ToLength(realm, Get(realm, O, "length"));

    // 3. If len is zero, then
    if (len === 0) {
      // a. Perform ? Set(O, "length", 0, true).
      Properties.Set(realm, O, "length", realm.intrinsics.zero, true);

      // b. Return undefined.
      return realm.intrinsics.undefined;
    } else {
      // 4. Else len > 0,
      // a. Let newLen be len-1.
      let newLen = len - 1;

      // b. Let indx be ! ToString(newLen).
      let indx = new StringValue(realm, newLen + "");

      // c. Let element be ? Get(O, indx).
      let element = Get(realm, O, indx);

      // d. Perform ? DeletePropertyOrThrow(O, indx).
      Properties.DeletePropertyOrThrow(realm, O.throwIfNotConcreteObject(), indx);

      // e. Perform ? Set(O, "length", newLen, true).
      Properties.Set(realm, O, "length", new NumberValue(realm, newLen), true);

      // f. Return element.
      return element;
    }
  });

  // ECMA262 22.1.3.18
  obj.defineNativeMethod("push", 1, (context, args, argCount) => {
    // 1. Let O be ? ToObject(this value).
    let O = To.ToObject(realm, context);

    // If we have an object that is an array with widened numeric properties, then
    // we can return a temporal here as we know nothing of the array's properties.
    // This should be safe to do, as we never expose the internals of the array.
    if (
      ArrayValue.isIntrinsicAndHasWidenedNumericProperty(O) &&
      realm.isInPureScope() &&
      O.$GetOwnProperty("push") === undefined
    ) {
      return AbstractValue.createTemporalFromBuildFunction(
        realm,
        NumberValue,
        [O, new StringValue(realm, "push"), ...args],
        createOperationDescriptor("UNKNOWN_ARRAY_METHOD_PROPERTY_CALL")
      );
    }

    // 2. Let len be ? ToLength(? Get(O, "length")).
    let len = To.ToLength(realm, Get(realm, O, new StringValue(realm, "length")));

    // 3. Let items be a List whose elements are, in left to right order, the arguments that were passed to realm function invocation.
    let items = argCount > 0 ? args : [];

    // 4. Let argCount be the number of elements in items.
    argCount;

    // 5. If len + argCount > 2^53-1, throw a TypeError exception.
    if (len + argCount > Math.pow(2, 53) - 1) {
      throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError, "Array.prototype");
    }

    // 6. Repeat, while items is not empty
    while (items.length) {
      // a. Remove the first element from items and let E be the value of the element.
      let E = items.shift();

      // b. Perform ? Set(O, ! ToString(len), E, true).
      Properties.Set(realm, O, new StringValue(realm, len + ""), E, true);

      // c. Let len be len+1.
      len++;
    }

    // 7. Perform ? Set(O, "length", len, true).
    Properties.Set(realm, O, new StringValue(realm, "length"), new NumberValue(realm, len), true);

    // 8. Return len.
    return new NumberValue(realm, len);
  });

  // ECMA262 22.1.3.19
  obj.defineNativeMethod("reduce", 1, (context, [callbackfn, initialValue]) => {
    // 1. Let O be ? ToObject(this value).
    let O = To.ToObject(realm, context);

    // If we have an object that is an array with widened numeric properties, then
    // we can return a temporal here as we know nothing of the array's properties.
    // This should be safe to do, as we never expose the internals of the array.
    if (
      ArrayValue.isIntrinsicAndHasWidenedNumericProperty(O) &&
      realm.isInPureScope() &&
      O.$GetOwnProperty("reduce") === undefined
    ) {
      let args = [O, new StringValue(realm, "reduce"), callbackfn];
      if (initialValue) {
        args.push(initialValue);
      }
      return AbstractValue.createTemporalFromBuildFunction(
        realm,
        Value,
        args,
        createOperationDescriptor("UNKNOWN_ARRAY_METHOD_PROPERTY_CALL")
      );
    }

    // 2. Let len be ? ToLength(? Get(O, "length")).
    let len = To.ToLength(realm, Get(realm, O, "length"));

    // 3. If IsCallable(callbackfn) is false, throw a TypeError exception.
    if (!IsCallable(realm, callbackfn)) {
      throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError, "not a function");
    }

    // 4. If len is 0 and initialValue is not present, throw a TypeError exception.
    if (len === 0 && !initialValue) {
      throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError, "Array.prototype");
    }

    // 5. Let k be 0.
    let k = 0;

    // 6. If initialValue is present, then
    let accumulator;
    if (initialValue) {
      // a. Set accumulator to initialValue.
      accumulator = initialValue;
    } else {
      // 7. Else initialValue is not present,
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

    // 8. Repeat, while k < len
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

    // 9. Return accumulator.
    return accumulator;
  });

  // ECMA262 22.1.3.20
  obj.defineNativeMethod("reduceRight", 1, (context, [callbackfn, initialValue]) => {
    // 1. Let O be ? ToObject(this value).
    let O = To.ToObject(realm, context);

    // If we have an object that is an array with widened numeric properties, then
    // we can return a temporal here as we know nothing of the array's properties.
    // This should be safe to do, as we never expose the internals of the array.
    if (
      ArrayValue.isIntrinsicAndHasWidenedNumericProperty(O) &&
      realm.isInPureScope() &&
      O.$GetOwnProperty("reduceRight") === undefined
    ) {
      let args = [O, new StringValue(realm, "reduceRight"), callbackfn];
      if (initialValue) {
        args.push(initialValue);
      }
      return AbstractValue.createTemporalFromBuildFunction(
        realm,
        Value,
        args,
        createOperationDescriptor("UNKNOWN_ARRAY_METHOD_PROPERTY_CALL")
      );
    }

    // 2. Let len be ? ToLength(? Get(O, "length")).
    let len = To.ToLength(realm, Get(realm, O, "length"));

    // 3. If IsCallable(callbackfn) is false, throw a TypeError exception.
    if (!IsCallable(realm, callbackfn)) {
      throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError, "not a function");
    }

    // 4. If len is 0 and initialValue is not present, throw a TypeError exception.
    if (len === 0 && !initialValue) {
      throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError, "Array.prototype");
    }

    // 5. Let k be len-1.
    let k = len - 1;

    // 6. If initialValue is present, then
    let accumulator;
    if (initialValue) {
      // 1. Set accumulator to initialValue.
      accumulator = initialValue;
    } else {
      // 7. Else initialValue is not present,
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

    // 8. Repeat, while k ≥ 0
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

    // 9. Return accumulator.
    return accumulator;
  });

  // ECMA262 22.1.3.21
  obj.defineNativeMethod("reverse", 0, context => {
    // 1. Let O be ? ToObject(this value).
    let O = To.ToObject(realm, context);

    // If we have an object that is an array with widened numeric properties, then
    // we can return a temporal here as we know nothing of the array's properties.
    // This should be safe to do, as we never expose the internals of the array.
    if (
      ArrayValue.isIntrinsicAndHasWidenedNumericProperty(O) &&
      realm.isInPureScope() &&
      O.$GetOwnProperty("reverse") === undefined
    ) {
      AbstractValue.createTemporalFromBuildFunction(
        realm,
        ArrayValue,
        [O, new StringValue(realm, "reverse")],
        createOperationDescriptor("UNKNOWN_ARRAY_METHOD_PROPERTY_CALL")
      );
      return O;
    }

    // 2. Let len be ? ToLength(? Get(O, "length")).
    let len = To.ToLength(realm, Get(realm, O, "length"));

    // 3. Let middle be floor(len/2).
    let middle = Math.floor(len / 2);

    // 4. Let lower be 0.
    let lower = 0;

    // 5. Repeat, while lower ≠ middle
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

    // 6. Return O.
    return O;
  });

  // ECMA262 22.1.3.22
  obj.defineNativeMethod("shift", 0, context => {
    // 1. Let O be ? ToObject(this value).
    let O = To.ToObject(realm, context);

    // If we have an object that is an array with widened numeric properties, then
    // we can return a temporal here as we know nothing of the array's properties.
    // This should be safe to do, as we never expose the internals of the array.
    if (
      ArrayValue.isIntrinsicAndHasWidenedNumericProperty(O) &&
      realm.isInPureScope() &&
      O.$GetOwnProperty("shift") === undefined
    ) {
      return AbstractValue.createTemporalFromBuildFunction(
        realm,
        Value,
        [O, new StringValue(realm, "shift")],
        createOperationDescriptor("UNKNOWN_ARRAY_METHOD_PROPERTY_CALL")
      );
    }

    // 2. Let len be ? ToLength(? Get(O, "length")).
    let len = To.ToLength(realm, Get(realm, O, "length"));

    // 3. If len is zero, then
    if (len === 0) {
      // a. Perform ? Set(O, "length", 0, true).
      Properties.Set(realm, O, "length", realm.intrinsics.zero, true);

      // b. Return undefined.
      return realm.intrinsics.undefined;
    }

    // 4. Let first be ? Get(O, "0").
    let first = Get(realm, O, "0");

    // 5. Let k be 1.
    let k = 0;

    // 6. Repeat, while k < len
    while (k < len) {
      // a. Let from be ! ToString(k).
      let frm = new StringValue(realm, k + "");

      // b. Let to be ! ToString(k-1).
      let to = new StringValue(realm, k - 1 + "");

      // c. Let fromPresent be ? HasProperty(O, from).
      let fromPresent = HasProperty(realm, O, frm);

      // d. If fromPresent is true, then
      if (fromPresent) {
        // i. Let fromVal be ? Get(O, from).
        let fromVal = Get(realm, O, frm);

        // ii. Perform ? Set(O, to, fromVal, true).
        Properties.Set(realm, O, to, fromVal, true);
      } else {
        // d. Else fromPresent is false,
        // i. Perform ? DeletePropertyOrThrow(O, to).
        Properties.DeletePropertyOrThrow(realm, O.throwIfNotConcreteObject(), to);
      }

      // e. Increase k by 1.
      k++;
    }

    // 7. Perform ? DeletePropertyOrThrow(O, ! ToString(len-1)).
    Properties.DeletePropertyOrThrow(realm, O.throwIfNotConcreteObject(), new StringValue(realm, len - 1 + ""));

    // 8. Perform ? Set(O, "length", len-1, true).
    Properties.Set(realm, O, "length", new NumberValue(realm, len - 1), true);

    // 9. Return first.
    return first;
  });

  // ECMA262 22.1.3.23
  obj.defineNativeMethod("slice", 2, (context, [start, end]) => {
    // 1. Let O be ? ToObject(this value).
    let O = To.ToObject(realm, context);

    if (
      ArrayValue.isIntrinsicAndHasWidenedNumericProperty(O) &&
      realm.isInPureScope() &&
      O.$GetOwnProperty("slice") === undefined
    ) {
      let newArgs = [O, new StringValue(realm, "slice"), start, end];
      return ArrayValue.createTemporalWithWidenedNumericProperty(
        realm,
        newArgs,
        createOperationDescriptor("UNKNOWN_ARRAY_METHOD_PROPERTY_CALL")
      );
    }

    // 2. Let len be ? ToLength(? Get(O, "length")).
    let len = To.ToLength(realm, Get(realm, O, "length"));

    // 3. Let relativeStart be ? ToInteger(start).
    let relativeStart = To.ToInteger(realm, start);

    // 4. If relativeStart < 0, let k be max((len + relativeStart), 0); else let k be min(relativeStart, len).
    let k = relativeStart < 0 ? Math.max(len + relativeStart, 0) : Math.min(relativeStart, len);

    // 5. If end is undefined, let relativeEnd be len; else let relativeEnd be ? ToInteger(end).
    let relativeEnd = !end || end instanceof UndefinedValue ? len : To.ToInteger(realm, end.throwIfNotConcrete());

    // 6. If relativeEnd < 0, let final be max((len + relativeEnd), 0); else let final be min(relativeEnd, len).
    let final = relativeEnd < 0 ? Math.max(len + relativeEnd, 0) : Math.min(relativeEnd, len);

    // 7. Let count be max(final - k, 0).
    let count = Math.max(final - k, 0);

    // 8. Let A be ? ArraySpeciesCreate(O, count).
    let A = Create.ArraySpeciesCreate(realm, O.throwIfNotConcreteObject(), count);

    // 9. Let n be 0.
    let n = 0;

    // 10. Repeat, while k < final
    while (k < final) {
      // a. Let Pk be ! ToString(k).
      let Pk = new StringValue(realm, k + "");

      // b. Let kPresent be ? HasProperty(O, Pk).
      let kPresent = HasProperty(realm, O, Pk);

      // c. If kPresent is true, then
      if (kPresent) {
        // i. Let kValue be ? Get(O, Pk).
        let kValue = Get(realm, O, Pk);

        // ii. Perform ? CreateDataPropertyOrThrow(A, ! ToString(n), kValue).
        Create.CreateDataPropertyOrThrow(realm, A, new StringValue(realm, n + ""), kValue);
      }

      // d. Increase k by 1.
      k++;

      // e. Increase n by 1.
      n++;
    }

    // 11. Perform ? Set(A, "length", n, true).
    Properties.Set(realm, A, "length", new NumberValue(realm, n), true);

    // 12. Return A.
    return A;
  });

  // ECMA262 22.1.3.24
  obj.defineNativeMethod("some", 1, (context, [callbackfn, thisArg]) => {
    // 1. Let O be ? ToObject(this value).
    let O = To.ToObject(realm, context);

    // If we have an object that is an array with widened numeric properties, then
    // we can return a temporal here as we know nothing of the array's properties.
    // This should be safe to do, as we never expose the internals of the array.
    if (
      ArrayValue.isIntrinsicAndHasWidenedNumericProperty(O) &&
      realm.isInPureScope() &&
      O.$GetOwnProperty("some") === undefined
    ) {
      let args = [O, new StringValue(realm, "some"), callbackfn];
      if (thisArg) {
        args.push(thisArg);
      }
      return AbstractValue.createTemporalFromBuildFunction(
        realm,
        BooleanValue,
        args,
        createOperationDescriptor("UNKNOWN_ARRAY_METHOD_PROPERTY_CALL")
      );
    }

    // 2. Let len be ? ToLength(? Get(O, "length")).
    let len = To.ToLength(realm, Get(realm, O, "length"));

    // 3. If IsCallable(callbackfn) is false, throw a TypeError exception.
    if (!IsCallable(realm, callbackfn)) {
      throw realm.createErrorThrowCompletion(
        realm.intrinsics.TypeError,
        "callback passed to Array.prototype.some isn't callable"
      );
    }

    // 4. If thisArg was supplied, let T be thisArg; else let T be undefined.
    let T = thisArg || realm.intrinsics.undefined;

    // 5. Let k be 0.
    let k = 0;

    // 6. Repeat, while k < len
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

    // 7. Return false.
    return realm.intrinsics.false;
  });

  // ECMA262 22.1.3.25
  obj.defineNativeMethod("sort", 1, (context, [comparefn]) => {
    // 1. Let obj be ? ToObject(this value).
    let O = To.ToObject(realm, context);

    // If we have an object that is an array with widened numeric properties, then
    // we can return a temporal here as we know nothing of the array's properties.
    // This should be safe to do, as we never expose the internals of the array.
    if (
      ArrayValue.isIntrinsicAndHasWidenedNumericProperty(O) &&
      realm.isInPureScope() &&
      O.$GetOwnProperty("sort") === undefined
    ) {
      let args = [O, new StringValue(realm, "sort"), comparefn];
      AbstractValue.createTemporalFromBuildFunction(
        realm,
        Value,
        args,
        createOperationDescriptor("UNKNOWN_ARRAY_METHOD_PROPERTY_CALL")
      );
      // context is returned instead of O at the end of this method
      // so we do the same here
      return context;
    }

    // 2. Let len be ? ToLength(? Get(obj, "length")).
    let len = To.ToLength(realm, Get(realm, O, "length"));

    // Within this specification of the sort method, an object, obj, is said to be sparse if the following algorithm returns true:
    let isSparse = () => {
      // 1.For each integer i in the range 0≤i< len
      for (let i = 0; i < len; i++) {
        // a.Let elem be obj.[[GetOwnProperty]](! ToString(i)).
        let elem = O.$GetOwnProperty(i.toString());
        // b.If elem is undefined, return true.
        if (elem === undefined) return true;
        Properties.ThrowIfMightHaveBeenDeleted(elem);
      }
      // 2.Return false.
      return false;
    };
    let sparse = isSparse();

    // Let proto be obj.[[GetPrototypeOf]]().
    let proto = O.$GetPrototypeOf();

    // If proto is not null
    if (!(proto instanceof NullValue)) {
      // and there exists an integer j such that all of the conditions below are satisfied then the sort order is implementation-defined:
      for (let j = 0; j < len; j++) {
        // HasProperty(proto, ToString(j)) is true.
        if (
          HasProperty(realm, proto, j.toString()) &&
          // obj is sparse
          sparse
        )
          // We abord when the result of the sort is implementation defined.
          throw Error("Implentation defined behavior detected");
      }
    }

    // The sort order is also implementation defined if obj is sparse and any of the following conditions are true:
    if (sparse) {
      // IsExtensible(obj) is false.
      if (!IsExtensible(realm, O)) throw Error("Implementation defined behavior, Array is both sparse and extensible");
      // Any integer index property of obj whose name is a nonnegative integer less than len
      for (let j = 0; j < len; j++) {
        // is a data property whose [[Configurable]] attribute is false.
        let prop = O.$GetOwnProperty(j.toString());
        if (prop !== undefined && !prop.throwIfNotConcrete(realm).configurable) {
          Properties.ThrowIfMightHaveBeenDeleted(prop);
          throw Error(
            "Implementation defined behavior :  Array is sparse and it's prototype has some numbered properties"
          );
        }
      }
    }

    // Any integer index property of obj whose name is a nonnegative integer less than len
    for (let j = 0; j < len; j++) {
      //is a data property whose [[writable]] attribute is false.
      let prop = O.$GetOwnProperty(j.toString());
      if (prop !== undefined && !prop.throwIfNotConcrete(realm).writable) {
        Properties.ThrowIfMightHaveBeenDeleted(prop);
        throw Error("Implementation defined behavior : property " + j.toString() + "is non writable : ");
      }
    }

    // The SortCompare abstract operation is called with two arguments x and y. It also has access to the comparefn
    // argument passed to the current invocation of the sort method. The following steps are taken:

    // 22.1.3.25.1 Runtime Semantics: SortCompare( x, y )#
    let SortCompare = (x, y) => {
      x = x.throwIfNotConcrete();
      y = y.throwIfNotConcrete();
      // 1. If x and y are both undefined, return +0.
      if (x instanceof UndefinedValue && y instanceof UndefinedValue) {
        return realm.intrinsics.zero;
      }
      // 2. If x is undefined, return 1.
      if (x instanceof UndefinedValue) {
        return new NumberValue(realm, 1);
      }
      // 3. If y is undefined, return -1.
      if (y instanceof UndefinedValue) {
        return new NumberValue(realm, -1);
      }
      // 4. If the argument comparefn is not undefined, then
      if (!comparefn.mightBeUndefined()) {
        // a. Let v be ? ToNumber(? Call(comparefn, undefined, « x, y »)).
        let v = To.ToNumber(realm, Call(realm, comparefn, new UndefinedValue(realm), [x, y]));
        // b. If v is NaN, return +0.
        if (isNaN(v)) return new NumberValue(realm, +0);
        // c. Return v.
        return new NumberValue(realm, v);
      } else {
        comparefn.throwIfNotConcrete();
      }
      // 5. Let xString be ? ToString(x).
      let xString = new StringValue(realm, To.ToString(realm, x));
      // 6. Let yString be ? ToString(y).
      let yString = new StringValue(realm, To.ToString(realm, y));
      // 7. Let xSmaller be the result of performing Abstract Relational Comparison xString < yString.
      let xSmaller = AbstractRelationalComparison(realm, xString, yString, true, "<");
      // 8. If xSmaller is true, return -1.
      if (xSmaller.value) return new NumberValue(realm, -1);
      // 9. Let ySmaller be the result of performing Abstract Relational Comparison yString < xString.
      let ySmaller = AbstractRelationalComparison(realm, yString, xString, true, "<");
      // 10. If ySmaller is true, return 1.
      if (ySmaller.value) return new NumberValue(realm, 1);
      // 11. Return +0.
      return realm.intrinsics.zero;
    };

    //1. Perform an implementation-dependent sequence of calls to the [[Get]] and [[Set]] internal methods of obj, to the DeletePropertyOrThrow and HasOwnProperty abstract operation with obj as the first argument, and to SortCompare (described below), such that:
    //   The property key argument for each call to [[Get]], [[Set]], HasOwnProperty, or DeletePropertyOrThrow is the string representation of a nonnegative integer less than len.

    // We leverage the underlying implementation sort by copying the element in a temp. array, sorting it, and
    // transfering back the value inside the our array.

    let arr = [];

    // We need to adapt the comparefn function to match the expected types
    let comparefn_ = (x, y) => {
      invariant(x instanceof Value, "Unexpected type");
      invariant(y instanceof Value, "Unexpected type");

      let result_ = SortCompare(x, y);
      let numb = To.ToNumber(realm, result_);
      return numb;
    };

    for (let j = 0; j < len; j++) {
      // The property key argument for each call to [[Get]], [[Set]], HasOwnProperty, or DeletePropertyOrThrow is the string representation of a nonnegative integer less than len.
      if (!HasOwnProperty(realm, O, j.toString())) continue;
      // The arguments for calls to SortCompare are values returned by a previous call to the [[Get]] internal method,
      // unless the properties accessed by those previous calls did not exist according to HasOwnProperty.

      // -- Important : We rely on the fact that the underlying sort implementation respect the standard for the following 3 properties
      // If both perspective arguments to SortCompare correspond to non-existent properties,
      // use +0 instead of calling SortCompare. If only the first perspective argument is non-existent use +1.
      // If only the second perspective argument is non-existent use -1.
      let val = O.$Get(j.toString(), O);
      arr[j] = val;
    }

    arr.sort(comparefn_);

    //Apply the permutation back to the original array.
    for (let j = 0; j < len; j++) {
      if (arr.hasOwnProperty(j.toString())) {
        let ok = O.$Set(j.toString(), arr[j], O);
        // If any [[Set]] call returns false a TypeError exception is thrown.
        if (!ok) throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError, "[[Set]] returned false");
      } else {
        // If obj is not sparse then DeletePropertyOrThrow must not be called.
        invariant(sparse);
        Properties.DeletePropertyOrThrow(realm, O.throwIfNotConcreteObject(), j.toString());
      }
    }
    // If an abrupt completion is returned from any of these operations, it is immediately returned as the value of this function.

    // 2. Return obj;
    return context;
  });

  // ECMA262 22.1.3.26
  obj.defineNativeMethod("splice", 2, (context, [start, deleteCount, ...items], argLength) => {
    // 1. Let O be ? ToObject(this value).
    let O = To.ToObject(realm, context);

    // If we have an object that is an array with widened numeric properties, then
    // we can return a temporal here as we know nothing of the array's properties.
    // This should be safe to do, as we never expose the internals of the array.
    if (
      ArrayValue.isIntrinsicAndHasWidenedNumericProperty(O) &&
      realm.isInPureScope() &&
      O.$GetOwnProperty("splice") === undefined
    ) {
      let args = [O, new StringValue(realm, "splice"), start];
      if (deleteCount) {
        args.push(deleteCount);
      }
      if (items && items.length > 0) {
        args.push(...items);
      }
      return AbstractValue.createTemporalFromBuildFunction(
        realm,
        ArrayValue,
        args,
        createOperationDescriptor("UNKNOWN_ARRAY_METHOD_PROPERTY_CALL")
      );
    }

    // 2. Let len be ? ToLength(? Get(O, "length")).
    let len = To.ToLength(realm, Get(realm, O, "length"));

    // 3. Let relativeStart be ? ToInteger(start).
    let relativeStart = To.ToInteger(realm, start);

    // 4. If relativeStart < 0, let actualStart be max((len + relativeStart), 0); else let actualStart be min(relativeStart, len).
    let actualStart = relativeStart < 0 ? Math.max(len + relativeStart, 0) : Math.min(relativeStart, len);

    let insertCount;
    let actualDeleteCount;

    // 5. If the number of actual arguments is 0, then
    if (argLength === 0) {
      // a. Let insertCount be 0.
      insertCount = 0;

      // b. Let actualDeleteCount be 0.
      actualDeleteCount = 0;
    } else if (argLength === 1) {
      // 6. Else if the number of actual arguments is 1, then
      // a. Let insertCount be 0.
      insertCount = 0;

      // b. Let actualDeleteCount be len - actualStart.
      actualDeleteCount = len - actualStart;
    } else {
      // 7. Else,
      // a. Let insertCount be the number of actual arguments minus 2.
      insertCount = argLength - 2;

      // b. Let dc be ? ToInteger(deleteCount).
      let dc = To.ToInteger(realm, deleteCount);

      // c. Let actualDeleteCount be min(max(dc, 0), len - actualStart).
      actualDeleteCount = Math.min(Math.max(dc, 0), len - actualStart);
    }

    // 8. If len+insertCount-actualDeleteCount > 2^53-1, throw a TypeError exception.
    if (len + insertCount - actualDeleteCount > Math.pow(2, 53) - 1) {
      throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError, "the item count is too damn high");
    }

    // 9. Let A be ? ArraySpeciesCreate(O, actualDeleteCount).
    let A = Create.ArraySpeciesCreate(realm, O.throwIfNotConcreteObject(), actualDeleteCount);

    // 10. Let k be 0.
    let k = 0;

    // 11. Repeat, while k < actualDeleteCount
    while (k < actualDeleteCount) {
      // a. Let from be ! ToString(actualStart+k).
      let frm = new StringValue(realm, actualStart + k + "");

      // b. Let fromPresent be ? HasProperty(O, from).
      let fromPresent = HasProperty(realm, O, frm);

      // c. If fromPresent is true, then
      if (fromPresent) {
        // i. Let fromValue be ? Get(O, from).
        let fromValue = Get(realm, O, frm);

        // ii. Perform ? CreateDataPropertyOrThrow(A, ! ToString(k), fromValue).
        Create.CreateDataPropertyOrThrow(realm, A, new StringValue(realm, k + ""), fromValue);
      }

      // d. Increment k by 1.
      k++;
    }

    // 12. Perform ? Set(A, "length", actualDeleteCount, true).
    Properties.Set(realm, A, "length", new NumberValue(realm, actualDeleteCount), true);

    // 13. Let items be a List whose elements are, in left to right order, the portion of the actual argument
    //     list starting with the third argument. The list is empty if fewer than three arguments were passed.
    items;

    // 14. Let itemCount be the number of elements in items.
    let itemCount = items.length;

    // 15. If itemCount < actualDeleteCount, then
    if (itemCount < actualDeleteCount) {
      // a. Let k be actualStart.
      k = actualStart;

      // b. Repeat, while k < (len - actualDeleteCount)
      while (k < len - actualDeleteCount) {
        // i. Let from be ! ToString(k+actualDeleteCount).
        let frm = new StringValue(realm, k + actualDeleteCount + "");

        // ii. Let to be ! ToString(k+itemCount).
        let to = new StringValue(realm, k + itemCount + "");

        // iii. Let fromPresent be ? HasProperty(O, from).
        let fromPresent = HasProperty(realm, O, frm);

        // iv. If fromPresent is true, then
        if (fromPresent) {
          // 1. Let fromValue be ? Get(O, from).
          let fromValue = Get(realm, O, frm);

          // 2. Perform ? Set(O, to, fromValue, true).
          Properties.Set(realm, O, to, fromValue, true);
        } else {
          // v. Else fromPresent is false,
          // 1. Perform ? DeletePropertyOrThrow(O, to).
          Properties.DeletePropertyOrThrow(realm, O.throwIfNotConcreteObject(), to);
        }

        // vi. Increase k by 1.
        k++;
      }

      // c. Let k be len.
      k = len;

      // d. Repeat, while k > (len - actualDeleteCount + itemCount)
      while (k > len - actualDeleteCount + itemCount) {
        // i. Perform ? DeletePropertyOrThrow(O, ! ToString(k-1)).
        Properties.DeletePropertyOrThrow(realm, O.throwIfNotConcreteObject(), new StringValue(realm, k - 1 + ""));

        // ii. Decrease k by 1.
        k--;
      }
    } else if (itemCount > actualDeleteCount) {
      // 16. Else if itemCount > actualDeleteCount, then
      // a. Let k be (len - actualDeleteCount).
      k = len - actualDeleteCount;

      // b. Repeat, while k > actualStart
      while (k > actualStart) {
        // i. Let from be ! ToString(k + actualDeleteCount - 1).
        let frm = new StringValue(realm, k + actualDeleteCount - 1 + "");

        // ii. Let to be ! ToString(k + itemCount - 1).
        let to = new StringValue(realm, k + itemCount - 1 + "");

        // iii. Let fromPresent be ? HasProperty(O, from).
        let fromPresent = HasProperty(realm, O, frm);

        // iv. If fromPresent is true, then
        if (fromPresent) {
          // 1. Let fromValue be ? Get(O, from).
          let fromValue = Get(realm, O, frm);

          // 2. Perform ? Set(O, to, fromValue, true).
          Properties.Set(realm, O, to, fromValue, true);
        } else {
          // v. Else fromPresent is false,
          // 1. Perform ? DeletePropertyOrThrow(O, to).
          Properties.DeletePropertyOrThrow(realm, O.throwIfNotConcreteObject(), to);
        }

        // vi. Decrease k by 1.
        k--;
      }
    }

    // 17. Let k be actualStart.
    k = actualStart;

    // 18. Repeat, while items is not empty
    while (items.length) {
      // a. Remove the first element from items and let E be the value of that element.
      let E = items.shift();

      // b. Perform ? Set(O, ! ToString(k), E, true).
      Properties.Set(realm, O, new StringValue(realm, k + ""), E, true);

      // c. Increase k by 1.
      k++;
    }

    // 19. Perform ? Set(O, "length", len - actualDeleteCount + itemCount, true).
    Properties.Set(realm, O, "length", new NumberValue(realm, len - actualDeleteCount + itemCount), true);

    // 20. Return A.
    return A;
  });

  // ECMA262 22.1.3.27
  obj.defineNativeMethod("toLocaleString", 0, context => {
    // 1. Let array be ? ToObject(this value).
    let array = To.ToObject(realm, context);

    // If we have an object that is an array with widened numeric properties, then
    // we can return a temporal here as we know nothing of the array's properties.
    // This should be safe to do, as we never expose the internals of the array.
    if (
      ArrayValue.isIntrinsicAndHasWidenedNumericProperty(array) &&
      realm.isInPureScope() &&
      array.$GetOwnProperty("toLocaleString") === undefined
    ) {
      return AbstractValue.createTemporalFromBuildFunction(
        realm,
        StringValue,
        [array, new StringValue(realm, "toLocaleString")],
        createOperationDescriptor("UNKNOWN_ARRAY_METHOD_PROPERTY_CALL")
      );
    }

    // 2. Let len be ? ToLength(? Get(array, "length")).
    let len = To.ToLength(realm, Get(realm, array, "length"));

    // 3. Let separator be the String value for the list-separator String appropriate for the host environment's
    //    current locale (this is derived in an implementation-defined way).
    let separator = ",";

    // 4. If len is zero, return the empty String.
    if (len === 0) return realm.intrinsics.emptyString;

    // 5. Let firstElement be ? Get(array, "0").
    let firstElement = Get(realm, array, "0");

    // 6. If firstElement is undefined or null, then
    let R: ?string;
    if (HasSomeCompatibleType(firstElement, UndefinedValue, NullValue)) {
      // a. Let R be the empty String.
      R = "";
    } else {
      // 7. Else,
      // a. Let R be ? ToString(? Invoke(firstElement, "toLocaleString")).
      R = To.ToStringPartial(realm, Invoke(realm, firstElement, "toLocaleString"));
    }

    // 8. Let k be 1.
    let k = 1;

    // 9. Repeat, while k < len
    while (k < len) {
      // a. Let S be a String value produced by concatenating R and separator.
      let S: string = R + separator;

      // b. Let nextElement be ? Get(array, ! ToString(k)).
      let nextElement = Get(realm, array, new StringValue(realm, k + "")).throwIfNotConcrete();

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

    // 10. Return R.
    return new StringValue(realm, R);
  });

  // ECMA262 22.1.3.28
  obj.defineNativeProperty("toString", realm.intrinsics.ArrayProto_toString);

  // ECMA262 22.1.3.29
  obj.defineNativeMethod("unshift", 1, (context, items, argCount) => {
    // 1. Let O be ? ToObject(this value).
    let O = To.ToObject(realm, context);

    // If we have an object that is an array with widened numeric properties, then
    // we can return a temporal here as we know nothing of the array's properties.
    // This should be safe to do, as we never expose the internals of the array.
    if (
      ArrayValue.isIntrinsicAndHasWidenedNumericProperty(O) &&
      realm.isInPureScope() &&
      O.$GetOwnProperty("unshift") === undefined
    ) {
      return AbstractValue.createTemporalFromBuildFunction(
        realm,
        NumberValue,
        [O, new StringValue(realm, "unshift")],
        createOperationDescriptor("UNKNOWN_ARRAY_METHOD_PROPERTY_CALL")
      );
    }

    // 2. Let len be ? ToLength(? Get(O, "length")).
    let len = To.ToLength(realm, Get(realm, O, "length"));

    // 3. Let argCount be the number of actual arguments.
    argCount;

    // 4. If argCount > 0, then
    if (argCount > 0) {
      // a. If len+argCount > 2^53-1, throw a TypeError exception.
      if (len + argCount > Math.pow(2, 53) - 1) {
        throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError, "too damn high");
      }

      // b. Let k be len.
      let k = len;

      // c. Repeat, while k > 0,
      while (k > 0) {
        // i. Let from be ! ToString(k-1).
        let frm = new StringValue(realm, k - 1 + "");

        // ii. Let to be ! ToString(k+argCount-1).
        let to = new StringValue(realm, k + argCount - 1 + "");

        // iv. Let fromPresent be ? HasProperty(O, from).
        let fromPresent = HasProperty(realm, O, frm);

        // v. If fromPresent is true, then
        if (fromPresent) {
          // 1. Let fromValue be ? Get(O, from).
          let fromValue = Get(realm, O, frm);

          // 2. Perform ? Set(O, to, fromValue, true).
          Properties.Set(realm, O, to, fromValue, true);
        } else {
          // vi. Else fromPresent is false,
          // 1. Perform ? DeletePropertyOrThrow(O, to).
          Properties.DeletePropertyOrThrow(realm, O.throwIfNotConcreteObject(), to);
        }

        // vii. Decrease k by 1.
        k--;
      }

      // e. Let j be 0.
      let j = 0;

      // f. Let items be a List whose elements are, in left to right order, the arguments that were passed to
      //    this function invocation.
      items;

      // g. Repeat, while items is not empty
      while (items.length) {
        // i. Remove the first element from items and let E be the value of that element.
        let E = items.shift();

        // ii. Perform ? Set(O, ! ToString(j), E, true).
        Properties.Set(realm, O, new StringValue(realm, j + ""), E, true);

        // iii. Increase j by 1.
        j++;
      }
    }

    // 5. Perform ? Set(O, "length", len+argCount, true).
    Properties.Set(realm, O, "length", new NumberValue(realm, len + argCount), true);

    // 6. Return len+argCount.
    return new NumberValue(realm, len + argCount);
  });

  // ECMA262 22.1.3.30
  obj.defineNativeProperty("values", realm.intrinsics.ArrayProto_values);

  // ECMA262 22.1.3.32
  {
    // 1. Let unscopableList be ObjectCreate(null).
    let unscopableList = Create.ObjectCreate(realm, realm.intrinsics.null);

    // 2. Perform CreateDataProperty(unscopableList, "copyWithin", true).
    Create.CreateDataProperty(realm, unscopableList, "copyWithin", realm.intrinsics.true);

    // 3. Perform CreateDataProperty(unscopableList, "entries", true).
    Create.CreateDataProperty(realm, unscopableList, "entries", realm.intrinsics.true);

    // 4. Perform CreateDataProperty(unscopableList, "fill", true).
    Create.CreateDataProperty(realm, unscopableList, "fill", realm.intrinsics.true);

    // 5. Perform CreateDataProperty(unscopableList, "find", true).
    Create.CreateDataProperty(realm, unscopableList, "find", realm.intrinsics.true);

    // 6. Perform CreateDataProperty(unscopableList, "findIndex", true).
    Create.CreateDataProperty(realm, unscopableList, "findIndex", realm.intrinsics.true);

    // 7. Perform CreateDataProperty(unscopableList, "includes", true).
    Create.CreateDataProperty(realm, unscopableList, "includes", realm.intrinsics.true);

    // 8. Perform CreateDataProperty(unscopableList, "keys", true).
    Create.CreateDataProperty(realm, unscopableList, "keys", realm.intrinsics.true);

    // 9. Perform CreateDataProperty(unscopableList, "values", true).
    Create.CreateDataProperty(realm, unscopableList, "values", realm.intrinsics.true);

    // 10. Assert: Each of the above calls will return true.

    // 11. Return unscopableList.
    obj.defineNativeProperty(realm.intrinsics.SymbolUnscopables, unscopableList, {
      writable: false,
    });
  }
}
