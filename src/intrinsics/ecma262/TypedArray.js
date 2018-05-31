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
import type { ElementType, TypedArrayKind } from "../../types.js";
import { ElementSize } from "../../types.js";
import { NumberValue, NativeFunctionValue, ObjectValue, StringValue, UndefinedValue } from "../../values/index.js";
import {
  ArrayElementSize,
  ArrayElementType,
  AllocateTypedArray,
  AllocateTypedArrayBuffer,
  TypedArrayCreate,
} from "../../methods/typedarray.js";
import { SpeciesConstructor } from "../../methods/construct.js";
import { Get, GetMethod } from "../../methods/get.js";
import { Properties, To } from "../../singletons.js";
import { IterableToList } from "../../methods/iterator.js";
import { IsDetachedBuffer, IsConstructor, IsCallable } from "../../methods/is.js";
import { Call } from "../../methods/call.js";
import {
  CloneArrayBuffer,
  AllocateArrayBuffer,
  GetValueFromBuffer,
  SetValueInBuffer,
} from "../../methods/arraybuffer.js";
import invariant from "../../invariant.js";

export default function(realm: Realm): NativeFunctionValue {
  let func = new NativeFunctionValue(realm, "TypedArray", "TypedArray", 0, context => {
    // 1. Throw a TypeError exception.
    throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError, "TypedArray");
  });

  // ECMA262 22.2.2.1
  func.defineNativeMethod("from", 1, (context, [source, mapfn, thisArg]) => {
    // 1. Let C be the this value.
    let C = context;

    // 2. If IsConstructor(C) is false, throw a TypeError exception.
    if (IsConstructor(realm, C) === false) {
      throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError, "IsConstructor(C) is false");
    }
    invariant(C instanceof ObjectValue);

    let mapping;
    // 3. If mapfn was supplied and mapfn is not undefined, then
    if (mapfn !== undefined && !mapfn.mightBeUndefined()) {
      // a. If IsCallable(mapfn) is false, throw a TypeError exception.
      if (IsCallable(realm, mapfn) === false) {
        throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError, "IsConstructor(C) is false");
      }

      // b. Let mapping be true.
      mapping = true;
    } else {
      // 4. Else, let mapping be false.
      mapfn === undefined || mapfn.throwIfNotConcrete();
      mapping = false;
    }

    // 5. If thisArg was supplied, let T be thisArg; else let T be undefined.
    let T = thisArg !== undefined ? thisArg : realm.intrinsics.undefined;

    // 6. Let usingIterator be ? GetMethod(source, @@iterator).
    let usingIterator = GetMethod(realm, source, realm.intrinsics.SymbolIterator);

    // 7. If usingIterator is not undefined, then
    if (!(usingIterator instanceof UndefinedValue)) {
      // a. Let values be ? IterableToList(source, usingIterator).
      let values = IterableToList(realm, source, usingIterator);

      // b. Let len be the number of elements in values.
      let len = values.length;

      // c. Let targetObj be ? TypedArrayCreate(C, «len»).
      let targetObj = TypedArrayCreate(realm, C, [new NumberValue(realm, len)]);

      // d. Let k be 0.
      let k = 0;

      // e. Repeat, while k < len
      while (k < len) {
        // i. Let Pk be ! ToString(k).
        let Pk = To.ToString(realm, new NumberValue(realm, k));

        // ii. Let kValue be the first element of values and remove that element from values.
        let kValue = values.shift();

        let mappedValue;
        // iii. If mapping is true, then
        if (mapping === true) {
          // 1. Let mappedValue be ? Call(mapfn, T, « kValue, k »).
          mappedValue = Call(realm, mapfn, T, [kValue, new NumberValue(realm, k)]);
        } else {
          // iv. Else, let mappedValue be kValue.
          mappedValue = kValue;
        }

        // v. Perform ? Set(targetObj, Pk, mappedValue, true).
        Properties.Set(realm, targetObj, Pk, mappedValue, true);

        // vi. Increase k by 1.
        k = k + 1;
      }

      // f. Assert: values is now an empty List.
      invariant(values.length === 0, "values is not an empty List");

      // g. Return targetObj.
      return targetObj;
    }

    // 8. NOTE: source is not an Iterable so assume it is already an array-like object.

    // 9. Let arrayLike be ! ToObject(source).
    let arrayLike = To.ToObject(realm, source);

    // 10. Let len be ? ToLength(? Get(arrayLike, "length")).
    let len = To.ToLength(realm, Get(realm, arrayLike, "length"));

    // 11. Let targetObj be ? TypedArrayCreate(C, « len »).
    let targetObj = TypedArrayCreate(realm, C, [new NumberValue(realm, len)]);

    // 12. Let k be 0.
    let k = 0;

    // 13. Repeat, while k < len
    while (k < len) {
      // a. Let Pk be ! ToString(k).
      let Pk = To.ToString(realm, new NumberValue(realm, k));

      // b. Let kValue be ? Get(arrayLike, Pk).
      let kValue = Get(realm, arrayLike, Pk);

      let mappedValue;
      // c. If mapping is true, then
      if (mapping === true) {
        // i. Let mappedValue be ? Call(mapfn, T, « kValue, k »).
        mappedValue = Call(realm, mapfn, T, [kValue, new NumberValue(realm, k)]);
      } else {
        // d. Else, let mappedValue be kValue.
        mappedValue = kValue;
      }

      // e. Perform ? Set(targetObj, Pk, mappedValue, true).
      Properties.Set(realm, targetObj, Pk, mappedValue, true);

      // f. Increase k by 1.
      k = k + 1;
    }

    // 14. Return targetObj.
    return targetObj;
  });

  // ECMA262 22.2.2.2
  func.defineNativeMethod("of", 0, (context, items, argCount) => {
    // 1. Let len be the actual number of arguments passed to this function.
    let len = argCount;

    // 2. Let items be the List of arguments passed to this function.
    items;

    // 3. Let C be the this value.
    let C = context;

    // 4. If IsConstructor(C) is false, throw a TypeError exception.
    if (IsConstructor(realm, C) === false) {
      throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError, "IsConstructor(C) is false");
    }
    invariant(C instanceof ObjectValue);

    // 5. Let newObj be ? TypedArrayCreate(C, « len »).
    let newObj = TypedArrayCreate(realm, C, [new NumberValue(realm, len)]);

    // 6. Let k be 0.
    let k = 0;

    // 7. Repeat, while k < len
    while (k < len) {
      // a. Let kValue be items[k].
      let kValue = items[k];

      // b. Let Pk be ! ToString(k).
      let Pk = To.ToString(realm, new NumberValue(realm, k));

      // c. Perform ? Set(newObj, Pk, kValue, true).
      Properties.Set(realm, newObj, Pk, kValue, true);

      // d. Increase k by 1.
      k = k + 1;
    }

    // 8. Return newObj.
    return newObj;
  });

  // ECMA262 22.2.2.4
  func.defineNativeGetter(realm.intrinsics.SymbolSpecies, context => {
    // 1. Return the this value
    return context;
  });

  return func;
}

// ECMA262 22.2 Table 50
function getConstructorName(type: ElementType): TypedArrayKind {
  switch (type) {
    case "Float32":
      return "Float32Array";
    case "Float64":
      return "Float64Array";
    case "Int8":
      return "Int8Array";
    case "Int16":
      return "Int16Array";
    case "Int32":
      return "Int32Array";
    case "Uint8":
      return "Uint8Array";
    case "Uint16":
      return "Uint16Array";
    case "Uint32":
      return "Uint32Array";
    case "Uint8Clamped":
      return "Uint8ClampedArray";
    default:
      invariant(false);
  }
}

export function build(realm: Realm, type: ElementType): NativeFunctionValue {
  let func = new NativeFunctionValue(realm, `${type}Array`, `${type}Array`, 3, (context, args, argCount, NewTarget) => {
    if (argCount === 0) {
      // ECMA262 22.2.4.1

      // 1. If NewTarget is undefined, throw a TypeError exception.
      if (!NewTarget) {
        throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError, "NewTarget is undefined");
      }

      // 2. Let constructorName be the String value of the Constructor Name value specified in Table 50 for this TypedArray constructor.
      let constructorName = getConstructorName(type);

      // 3. Return ? AllocateTypedArray(constructorName, NewTarget, "%TypedArrayPrototype%", 0).
      return AllocateTypedArray(realm, constructorName, NewTarget, `${type}ArrayPrototype`, 0);
    } else if (!(args[0] instanceof ObjectValue)) {
      // ECMA262 22.2.4.2
      let length = args[0].throwIfNotConcrete();

      // 1. Assert: Type(length) is not Object.
      invariant(!(length instanceof ObjectValue), "Type(length) is not Object");

      // 2. If NewTarget is undefined, throw a TypeError exception.
      if (!NewTarget) {
        throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError, "NewTarget is undefined");
      }

      // 3. Let elementLength be ? ToIndex(length).
      let elementLength = To.ToIndexPartial(realm, length);

      // 4. Let constructorName be the String value of the Constructor Name value specified in Table 50 for this TypedArray constructor.
      let constructorName = getConstructorName(type);

      // 5. Return ? AllocateTypedArray(constructorName, NewTarget, "%TypedArrayPrototype%", elementLength).
      return AllocateTypedArray(realm, constructorName, NewTarget, `${type}ArrayPrototype`, elementLength);
    } else if ("$TypedArrayName" in args[0]) {
      // ECMA262 22.2.4.3
      let typedArray = args[0].throwIfNotConcrete();

      // 1. Assert: Type(typedArray) is Object and typedArray has a [[TypedArrayName]] internal slot.
      invariant(typedArray instanceof ObjectValue && typeof typedArray.$TypedArrayName === "string");

      // 2. If NewTarget is undefined, throw a TypeError exception.
      if (!NewTarget) {
        throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError, "NewTarget is undefined");
      }

      // 3. Let constructorName be the String value of the Constructor Name value specified in Table 50 for this TypedArray constructor.
      let constructorName = getConstructorName(type);

      // 4. Let O be ? AllocateTypedArray(constructorName, NewTarget, "%TypedArrayPrototype%").
      let O = AllocateTypedArray(realm, constructorName, NewTarget, `${type}ArrayPrototype`);

      // 5. Let srcArray be typedArray.
      let srcArray = typedArray;

      // 6. Let srcData be srcArray.[[ViewedArrayBuffer]].
      let srcData = srcArray.$ViewedArrayBuffer;
      invariant(srcData);

      // 7. If IsDetachedBuffer(srcData) is true, throw a TypeError exception.
      if (IsDetachedBuffer(realm, srcData) === true) {
        throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError, "IsDetachedBuffer(srcData) is true");
      }

      // 8. Let constructorName be the String value of O.[[TypedArrayName]].
      constructorName = O.$TypedArrayName;
      invariant(typeof constructorName === "string");

      // 9. Let elementType be the String value of the Element Type value in Table 50 for constructorName.
      let elementType = ArrayElementType[constructorName];

      // 10. Let elementLength be srcArray.[[ArrayLength]].
      let elementLength = srcArray.$ArrayLength;
      invariant(typeof elementLength === "number");

      // 11. Let srcName be the String value of srcArray.[[TypedArrayName]].
      let srcName = srcArray.$TypedArrayName;
      invariant(typeof srcName === "string");

      // 12. Let srcType be the String value of the Element Type value in Table 50 for srcName.
      let srcType = ArrayElementType[srcName];

      // 13. Let srcElementSize be the Element Size value in Table 50 for srcName.
      let srcElementSize = ArrayElementSize[srcName];

      // 14. Let srcByteOffset be srcArray.[[ByteOffset]].
      let srcByteOffset = srcArray.$ByteOffset;
      invariant(typeof srcByteOffset === "number");

      // 15. Let elementSize be the Element Size value in Table 50 for constructorName.
      let elementSize = ArrayElementSize[constructorName];

      // 16. Let byteLength be elementSize × elementLength.
      let byteLength = elementSize * elementLength;

      let data;
      // 17. If SameValue(elementType, srcType) is true, then
      if (elementType === srcType) {
        // a. Let data be ? CloneArrayBuffer(srcData, srcByteOffset).
        data = CloneArrayBuffer(realm, srcData, srcByteOffset);
      } else {
        // 18. Else,
        // a. Let bufferConstructor be ? SpeciesConstructor(srcData, %ArrayBuffer%).
        let bufferConstructor = SpeciesConstructor(realm, srcData, realm.intrinsics.ArrayBuffer);

        // b. Let data be ? AllocateArrayBuffer(bufferConstructor, byteLength).
        data = AllocateArrayBuffer(realm, bufferConstructor, byteLength);

        // c. If IsDetachedBuffer(srcData) is true, throw a TypeError exception.
        if (IsDetachedBuffer(realm, srcData) === true) {
          throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError, "IsDetachedBuffer(srcData) is true");
        }

        // d. Let srcByteIndex be srcByteOffset.
        let srcByteIndex = srcByteOffset;

        // e. Let targetByteIndex be 0.
        let targetByteIndex = 0;

        // f. Let count be elementLength.
        let count = elementLength;

        // g. Repeat, while count > 0
        while (count > 0) {
          // i. Let value be GetValueFromBuffer(srcData, srcByteIndex, srcType).
          let value = GetValueFromBuffer(realm, srcData, srcByteIndex, srcType);

          // ii. Perform SetValueInBuffer(data, targetByteIndex, elementType, value).
          SetValueInBuffer(realm, data, targetByteIndex, elementType, value.value);

          // iii. Set srcByteIndex to srcByteIndex + srcElementSize.
          srcByteIndex = srcByteIndex + srcElementSize;

          // iv. Set targetByteIndex to targetByteIndex + elementSize.
          targetByteIndex = targetByteIndex + elementSize;

          // v. Decrement count by 1.
          count -= 1;
        }
      }

      // 19. Set O.[[ViewedArrayBuffer]] to data.
      O.$ViewedArrayBuffer = data;

      // 20. Set O.[[ByteLength]] to byteLength.
      O.$ByteLength = byteLength;

      // 21. Set O.[[ByteOffset]] to 0.
      O.$ByteOffset = 0;

      // 22. Set O.[[ArrayLength]] to elementLength.
      O.$ArrayLength = elementLength;

      // 23. Return O.
      return O;
    } else if (!("$ArrayBufferData" in args[0]) && !("$TypedArrayName" in args[0])) {
      // ECMA262 22.2.4.4
      let object = args[0].throwIfNotConcrete();

      // 1. Assert: Type(object) is Object and object does not have either a [[TypedArrayName]] or an [[ArrayBufferData]] internal slot.
      invariant(object instanceof ObjectValue && typeof object.$TypedArrayName && !object.$ArrayBufferData);

      // 2. If NewTarget is undefined, throw a TypeError exception.
      if (!NewTarget) {
        throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError, "NewTarget is undefined");
      }

      // 3. Let constructorName be the String value of the Constructor Name value specified in Table 50 for this TypedArray constructor.
      let constructorName = getConstructorName(type);

      // 4. Let O be ? AllocateTypedArray(constructorName, NewTarget, "%TypedArrayPrototype%").
      let O = AllocateTypedArray(realm, constructorName, NewTarget, `${type}ArrayPrototype`);

      // 5. Let usingIterator be ? GetMethod(object, @@iterator).
      let usingIterator = GetMethod(realm, object, realm.intrinsics.SymbolIterator);

      // 6. If usingIterator is not undefined, then
      if (!(usingIterator instanceof UndefinedValue)) {
        // a. Let values be ? IterableToList(object, usingIterator).
        let values = IterableToList(realm, object, usingIterator);

        // b. Let len be the number of elements in values.
        let len = values.length;

        // c. Perform ? AllocateTypedArrayBuffer(O, len).
        AllocateTypedArrayBuffer(realm, O, len);

        // d. Let k be 0.
        let k = 0;

        // e. Repeat, while k < len
        while (k < len) {
          // i. Let Pk be ! ToString(k).
          let Pk = new StringValue(realm, To.ToString(realm, new NumberValue(realm, k)));

          // ii. Let kValue be the first element of values and remove that element from values.
          let kValue = values.shift();

          // iii. Perform ? Set(O, Pk, kValue, true).
          Properties.Set(realm, O, Pk, kValue, true);

          // iv. Increase k by 1.
          k = k + 1;
        }

        // f. Assert: values is now an empty List.
        invariant(values.length === 0);

        // g. Return O.
        return O;
      }

      // 7. NOTE: object is not an Iterable so assume it is already an array-like object.

      // 8. Let arrayLike be object.
      let arrayLike = object;

      // 9. Let len be ? ToLength(? Get(arrayLike, "length")).
      let len = To.ToLength(realm, Get(realm, arrayLike, "length"));

      // 10. Perform ? AllocateTypedArrayBuffer(O, len).
      AllocateTypedArrayBuffer(realm, O, len);

      // 11. Let k be 0.
      let k = 0;

      // 12. Repeat, while k < len
      while (k < len) {
        // a. Let Pk be ! ToString(k).
        let Pk = new StringValue(realm, To.ToString(realm, new NumberValue(realm, k)));

        // b. Let kValue be ? Get(arrayLike, Pk).
        let kValue = Get(realm, arrayLike, Pk);

        // c. Perform ? Set(O, Pk, kValue, true).
        Properties.Set(realm, O, Pk, kValue, true);

        // d. Increase k by 1.
        k += 1;
      }

      // 13. Return O.
      return O;
    } else {
      // ECMA262 22.2.4.5
      let buffer = args[0].throwIfNotConcrete(),
        byteOffset = args[1],
        length = args[2];

      // 1. Assert: Type(buffer) is Object and buffer has an [[ArrayBufferData]] internal slot.
      invariant(buffer instanceof ObjectValue && "$ArrayBufferData" in buffer);

      // 2. If NewTarget is undefined, throw a TypeError exception.
      if (!NewTarget) {
        throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError, "NewTarget is undefined");
      }

      // 3. Let constructorName be the String value of the Constructor Name value specified in Table 50 for this TypedArray constructor.
      let constructorName = getConstructorName(type);

      // 4. Let O be ? AllocateTypedArray(constructorName, NewTarget, "%TypedArrayPrototype%").
      let O = AllocateTypedArray(realm, constructorName, NewTarget, `${type}ArrayPrototype`);

      // 5. Let constructorName be the String value of O.[[TypedArrayName]].
      constructorName = O.$TypedArrayName;
      invariant(constructorName);

      // 6. Let elementSize be the Number value of the Element Size value in Table 50 for constructorName.
      let elementSize = ArrayElementSize[constructorName];

      // 7. Let offset be ? ToIndex(byteOffset).
      let offset = To.ToIndexPartial(realm, byteOffset);

      // 8. If offset modulo elementSize ≠ 0, throw a RangeError exception.
      if (offset % elementSize !== 0) {
        throw realm.createErrorThrowCompletion(realm.intrinsics.RangeError, "offset modulo elementSize ≠ 0");
      }

      // 9. If IsDetachedBuffer(buffer) is true, throw a TypeError exception.
      if (IsDetachedBuffer(realm, buffer) === true) {
        throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError, "IsDetachedBuffer(buffer) is true");
      }

      // 10. Let bufferByteLength be buffer.[[ArrayBufferByteLength]].
      let bufferByteLength = buffer.$ArrayBufferByteLength;
      invariant(typeof bufferByteLength === "number");

      let newByteLength;
      // 11. If length is either not present or undefined, then
      if (!length || length instanceof UndefinedValue) {
        // a. If bufferByteLength modulo elementSize ≠ 0, throw a RangeError exception.
        if (bufferByteLength % elementSize !== 0) {
          throw realm.createErrorThrowCompletion(
            realm.intrinsics.RangeError,
            "bufferByteLength modulo elementSize ≠ 0"
          );
        }
        // b. Let newByteLength be bufferByteLength - offset.
        newByteLength = bufferByteLength - offset;

        // c. If newByteLength < 0, throw a RangeError exception.
        if (newByteLength < 0) {
          throw realm.createErrorThrowCompletion(realm.intrinsics.RangeError, "newByteLength < 0");
        }
      } else {
        // 12. Else,
        // a. Let newLength be ? ToIndex(length).
        let newLength = To.ToIndexPartial(realm, length);

        // b. Let newByteLength be newLength × elementSize.
        newByteLength = newLength * elementSize;

        // c. If offset+newByteLength > bufferByteLength, throw a RangeError exception.
        if (offset + newByteLength > bufferByteLength) {
          throw realm.createErrorThrowCompletion(
            realm.intrinsics.RangeError,
            "offset+newByteLength > bufferByteLength"
          );
        }
      }

      // 13. Set O.[[ViewedArrayBuffer]] to buffer.
      O.$ViewedArrayBuffer = buffer;

      // 14. Set O.[[ByteLength]] to newByteLength.
      O.$ByteLength = newByteLength;

      // 15. Set O.[[ByteOffset]] to offset.
      O.$ByteOffset = offset;

      // 16. Set O.[[ArrayLength]] to newByteLength / elementSize.
      O.$ArrayLength = newByteLength / elementSize;

      // 17. Return O.
      return O;
    }
  });

  // ECMA262 22.2.5
  func.$Prototype = realm.intrinsics.TypedArray;

  // ECMA262 22.2.5.1
  func.defineNativeConstant("BYTES_PER_ELEMENT", new NumberValue(realm, ElementSize[type]));

  return func;
}
