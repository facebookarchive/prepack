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
import { AbruptCompletion } from "../../completions.js";
import {
  AbstractValue,
  ArrayValue,
  BooleanValue,
  NativeFunctionValue,
  NumberValue,
  ObjectValue,
  StringValue,
  UndefinedValue,
} from "../../values/index.js";
import {
  Construct,
  Call,
  Get,
  GetPrototypeFromConstructor,
  GetMethod,
  IsArray,
  IsConstructor,
  IsCallable,
} from "../../methods/index.js";
import { GetIterator, IteratorClose, IteratorStep, IteratorValue } from "../../methods/iterator.js";
import { Create, Leak, Properties, To } from "../../singletons.js";
import invariant from "../../invariant.js";
import { createOperationDescriptor } from "../../utils/generator.js";

export default function(realm: Realm): NativeFunctionValue {
  let func = new NativeFunctionValue(realm, "Array", "Array", 1, (context, [...items], argCount, NewTarget) => {
    if (argCount === 0) {
      // 1. Let numberOfArgs be the number of arguments passed to this function call.
      let numberOfArgs = argCount;

      // 2. Assert: numberOfArgs = 0.
      invariant(numberOfArgs === 0, "numberOfArgs = 0");

      // 3. If NewTarget is undefined, let newTarget be the active function object, else let newTarget be NewTarget.
      let newTarget = NewTarget === undefined ? func : NewTarget;

      // 4. Let proto be ? GetPrototypeFromConstructor(newTarget, "%ArrayPrototype%").
      let proto = GetPrototypeFromConstructor(realm, newTarget, "ArrayPrototype");

      // 5. Return ArrayCreate(0, proto).
      return Create.ArrayCreate(realm, 0, proto);
    } else if (argCount === 1) {
      // 1. Let numberOfArgs be the number of arguments passed to this function call.
      let numberOfArgs = argCount;

      // 2. Assert: numberOfArgs = 1.
      invariant(numberOfArgs === 1, "numberOfArgs = 1");

      // 3. If NewTarget is undefined, let newTarget be the active function object, else let newTarget be NewTarget.
      let newTarget = NewTarget === undefined ? func : NewTarget;

      // 4. Let proto be ? GetPrototypeFromConstructor(newTarget, "%ArrayPrototype%").
      let proto = GetPrototypeFromConstructor(realm, newTarget, "ArrayPrototype");

      // 5. Let array be ArrayCreate(0, proto).
      let array = Create.ArrayCreate(realm, 0, proto);

      // 6. If Type(len) is not Number, then
      let len = items[0];
      invariant(len !== undefined);
      let intLen;
      if (!len.mightBeNumber()) {
        // a. Let defineStatus be CreateDataProperty(array, "0", len).
        let defineStatus = Create.CreateDataProperty(realm, array, "0", len);

        // b. Assert: defineStatus is true.
        invariant(defineStatus, "defineStatus is true");

        // c. Let intLen be 1.
        intLen = 1;
      } else {
        // 7. Else,

        // a. Let intLen be ToUint32(len).
        intLen = To.ToUint32(realm, len.throwIfNotConcreteNumber());
        invariant(len instanceof NumberValue);

        // b If intLen ≠ len, throw a RangeError exception.
        if (intLen !== len.value) {
          throw realm.createErrorThrowCompletion(realm.intrinsics.RangeError, "intLen ≠ len");
        }
      }

      // 8. Perform ! Set(array, "length", intLen, true).
      Properties.Set(realm, array, "length", new NumberValue(realm, intLen), true);

      // 9. Return array.
      return array;
    } else {
      // 1. Let numberOfArgs be the number of arguments passed to this function call.
      let numberOfArgs = argCount;

      // 2. Assert: numberOfArgs ≥ 2.
      invariant(numberOfArgs >= 2, "numberOfArgs >= 2");

      // 3. If NewTarget is undefined, let newTarget be the active function object, else let newTarget be NewTarget.
      let newTarget = NewTarget === undefined ? func : NewTarget;

      // 4. Let proto be ? GetPrototypeFromConstructor(newTarget, "%ArrayPrototype%").
      let proto = GetPrototypeFromConstructor(realm, newTarget, "ArrayPrototype");

      // 5. Let array be ? ArrayCreate(numberOfArgs, proto).
      let array = Create.ArrayCreate(realm, numberOfArgs, proto);

      // 6. Let k be 0.
      let k = 0;

      // 7. Let items be a zero-origined List containing the argument items in order.
      items;

      // 8. Repeat, while k < numberOfArgs
      while (k < numberOfArgs) {
        // a. Let Pk be ! ToString(k).
        let Pk = To.ToString(realm, new NumberValue(realm, k));

        // b. Let itemK be items[k].
        let itemK = items[k];
        invariant(itemK !== undefined);

        // c. Let defineStatus be CreateDataProperty(array, Pk, itemK).
        let defineStatus = Create.CreateDataProperty(realm, array, Pk, itemK);

        // d. Assert: defineStatus is true.
        invariant(defineStatus, "defineStatus is true");

        // e. Increase k by 1.
        k += 1;
      }

      // 9. Assert: the value of array's length property is numberOfArgs.
      let length = Get(realm, array, "length").throwIfNotConcrete();
      invariant(length instanceof NumberValue);
      invariant(length.value === numberOfArgs, "the value of array's length property is numberOfArgs");

      // 10. Return array.
      return array;
    }
  });

  // ECMA262 22.1.2.2
  func.defineNativeMethod("isArray", 1, (context, [arg]) => {
    // 1. Return ? IsArray(arg).
    return new BooleanValue(realm, IsArray(realm, arg));
  });

  // ECMA262 22.1.2.3
  if (!realm.isCompatibleWith(realm.MOBILE_JSC_VERSION) && !realm.isCompatibleWith("mobile"))
    func.defineNativeMethod("of", 0, (context, [...items], argCount) => {
      // 1. Let len be the actual number of arguments passed to this function.
      let len = argCount;

      // 2. Let items be the List of arguments passed to this function.
      items;

      // 3. Let C be the this value.
      let C = context;

      // 4. If IsConstructor(C) is true, then
      let A;
      if (IsConstructor(realm, C)) {
        invariant(C instanceof ObjectValue);
        // a. Let A be ? Construct(C, « len »).
        A = Construct(realm, C, [new NumberValue(realm, len)]);
      } else {
        // 5. Else,
        // a. Let A be ? ArrayCreate(len).
        A = Create.ArrayCreate(realm, len);
      }

      // 6. Let k be 0.
      let k = 0;

      // 7. Repeat, while k < len
      while (k < len) {
        // a. Let kValue be items[k].
        let kValue = items[k];

        // b. Let Pk be ! To.ToString(k).
        let Pk = To.ToString(realm, new NumberValue(realm, k));

        // c. Perform ? CreateDataPropertyOrThrow(A, Pk, kValue).
        Create.CreateDataPropertyOrThrow(realm, A, Pk, kValue);

        // d. Increase k by 1.
        k += 1;
      }

      // 8. Perform ? Set(A, "length", len, true).
      Properties.Set(realm, A, "length", new NumberValue(realm, len), true);

      // 9. Return A.
      return A;
    });

  // ECMA262 22.1.2.1
  if (!realm.isCompatibleWith(realm.MOBILE_JSC_VERSION) && !realm.isCompatibleWith("mobile")) {
    let arrayFrom = func.defineNativeMethod("from", 1, (context, [items, mapfn, thisArg], argCount) => {
      // 1. Let C be the this value.
      let C = context;

      let mapping, T;
      // 2. If mapfn is undefined, let mapping be false.
      if (!mapfn || mapfn instanceof UndefinedValue) {
        mapping = false;
      } else if (mapfn.mightBeUndefined()) {
        invariant(mapfn instanceof AbstractValue);
        mapfn.throwIfNotConcrete();
      } else {
        // 3. Else,
        // a. If IsCallable(mapfn) is false, throw a TypeError exception.
        if (IsCallable(realm, mapfn) === false) {
          mapfn.throwIfNotConcrete();
          throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError, "IsCallable(mapfn) is false");
        }

        // b. If thisArg was supplied, let T be thisArg; else let T be undefined.
        T = thisArg !== undefined ? thisArg : realm.intrinsics.undefined;

        // c. Let mapping be true.
        mapping = true;
      }
      // If we're in pure scope and the items are completely abstract,
      // then create an abstract temporal with an array kind
      if (realm.isInPureScope() && items instanceof AbstractValue && items.values.isTop()) {
        let args = [arrayFrom, items];
        let possibleNestedOptimizedFunctions;
        if (mapfn) {
          args.push(mapfn);
          if (thisArg) {
            args.push(thisArg);
          }
          possibleNestedOptimizedFunctions = [
            { func: mapfn, thisValue: thisArg || realm.intrinsics.undefined, kind: "map" },
          ];
        }
        Leak.value(realm, items);
        return ArrayValue.createTemporalWithWidenedNumericProperty(
          realm,
          args,
          createOperationDescriptor("UNKNOWN_ARRAY_METHOD_CALL"),
          possibleNestedOptimizedFunctions
        );
      }

      // 4. Let usingIterator be ? GetMethod(items, @@iterator).
      let usingIterator = GetMethod(realm, items, realm.intrinsics.SymbolIterator);

      // 5. If usingIterator is not undefined, then
      if (!usingIterator.mightBeUndefined()) {
        let A;
        // a. If IsConstructor(C) is true, then
        if (IsConstructor(realm, C)) {
          invariant(C instanceof ObjectValue);
          // i. Let A be ? Construct(C).
          A = Construct(realm, C);
        } else {
          // b. Else,
          // i. Let A be ArrayCreate(0).
          A = Create.ArrayCreate(realm, 0);
        }

        // c. Let iterator be ? GetIterator(items, usingIterator).
        let iterator = GetIterator(realm, items, usingIterator);

        // d. Let k be 0.
        let k = 0;

        // e. Repeat
        while (true) {
          // i. If k ≥ 2^53-1, then
          if (k >= Math.pow(2, 53) - 1) {
            // 1. Let error be Completion{[[Type]]: throw, [[Value]]: a newly created TypeError object, [[Target]]: empty}.
            let error = realm.createErrorThrowCompletion(realm.intrinsics.TypeError, "k >= 2^53 - 1");

            // 2. Return ? IteratorClose(iterator, error).
            throw IteratorClose(realm, iterator, error);
          }

          // ii. Let Pk be ! ToString(k).
          let Pk = To.ToString(realm, new NumberValue(realm, k));

          // iii. Let next be ? IteratorStep(iterator).
          let next = IteratorStep(realm, iterator);

          // iv. If next is false, then
          if (next === false) {
            // 1. Perform ? Set(A, "length", k, true).
            Properties.Set(realm, A, "length", new NumberValue(realm, k), true);

            // 2. Return A.
            return A;
          }

          // v. Let nextValue be ? IteratorValue(next).
          let nextValue = IteratorValue(realm, next);

          let mappedValue;
          // vi. If mapping is true, then
          if (mapping === true) {
            // 1. Let mappedValue be Call(mapfn, T, « nextValue, k »).
            try {
              invariant(T !== undefined);
              mappedValue = Call(realm, mapfn, T, [nextValue, new NumberValue(realm, k)]);
            } catch (mappedValueCompletion) {
              if (mappedValueCompletion instanceof AbruptCompletion) {
                // 2. If mappedValue is an abrupt completion, return ? IteratorClose(iterator, mappedValue).
                throw IteratorClose(realm, iterator, mappedValueCompletion);
              } else {
                throw mappedValueCompletion;
              }
            }
            // 3. Let mappedValue be mappedValue.[[Value]].
          } else {
            // vii. Else, let mappedValue be nextValue.
            mappedValue = nextValue;
          }

          // viii. Let defineStatus be CreateDataPropertyOrThrow(A, Pk, mappedValue).
          try {
            Create.CreateDataPropertyOrThrow(realm, A, Pk, mappedValue);
          } catch (completion) {
            if (completion instanceof AbruptCompletion) {
              // ix. If defineStatus is an abrupt completion, return ? IteratorClose(iterator, defineStatus).
              throw IteratorClose(realm, iterator, completion);
            } else throw completion;
          }

          // x. Increase k by 1.
          k = k + 1;
        }
      } else {
        usingIterator.throwIfNotConcrete();
      }

      // 6. NOTE: items is not an Iterable so assume it is an array-like object.
      items = items.throwIfNotConcrete();
      invariant(items instanceof ObjectValue);

      // 7. Let arrayLike be ! ToObject(items).
      let arrayLike = To.ToObject(realm, items);

      // 8. Let len be ? ToLength(? Get(arrayLike, "length")).
      let len = To.ToLength(realm, Get(realm, arrayLike, "length"));

      let A;
      // 9. If IsConstructor(C) is true, then
      if (IsConstructor(realm, C)) {
        invariant(C instanceof ObjectValue);
        // a. Let A be ? Construct(C, « len »).
        A = Construct(realm, C, [new NumberValue(realm, len)]);
      } else {
        // 10. Else,
        // a. Let A be ? ArrayCreate(len).
        A = Create.ArrayCreate(realm, len);
      }

      // 11. Let k be 0.
      let k = 0;

      // 12. Repeat, while k < len
      while (k < len) {
        // a. Let Pk be ! ToString(k).
        let Pk = To.ToString(realm, new NumberValue(realm, k));

        // b. Let kValue be ? Get(arrayLike, Pk).
        let kValue = Get(realm, arrayLike, Pk);

        let mappedValue;
        // c. If mapping is true, then
        if (mapping === true) {
          // i. Let mappedValue be ? Call(mapfn, T, « kValue, k »).
          invariant(T !== undefined);
          mappedValue = Call(realm, mapfn, T, [kValue, new NumberValue(realm, k)]);
        } else {
          // d. Else, let mappedValue be kValue.
          mappedValue = kValue;
        }

        // e. Perform ? CreateDataPropertyOrThrow(A, Pk, mappedValue).
        Create.CreateDataPropertyOrThrow(realm, A, new StringValue(realm, Pk), mappedValue);

        // f. Increase k by 1.
        k = k + 1;
      }

      // 13. Perform ? Set(A, "length", len, true).
      Properties.Set(realm, A, "length", new NumberValue(realm, len), true);

      // 14. Return A.
      return A;
    });
  }

  // ECMA262 22.1.2.5
  func.defineNativeGetter(realm.intrinsics.SymbolSpecies, context => {
    // 1. Return the this value
    return context;
  });

  return func;
}
