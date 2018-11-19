/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

import type { Realm } from "../realm.js";
import type { TypedArrayKind } from "../types.js";
import { FatalError } from "../errors.js";
import {
  AbstractValue,
  AbstractObjectValue,
  IntegerIndexedExotic,
  ObjectValue,
  Value,
  NumberValue,
  UndefinedValue,
} from "../values/index.js";
import { GetPrototypeFromConstructor } from "./get.js";
import { AllocateArrayBuffer } from "./arraybuffer.js";
import { IsDetachedBuffer, IsInteger } from "./is.js";
import { GetValueFromBuffer, SetValueInBuffer } from "./arraybuffer.js";
import { Construct, SpeciesConstructor } from "./construct.js";
import { To } from "../singletons.js";
import invariant from "../invariant.js";

export const ArrayElementSize = {
  Float32Array: 4,
  Float64Array: 8,
  Int8Array: 1,
  Int16Array: 2,
  Int32Array: 4,
  Uint8Array: 1,
  Uint16Array: 2,
  Uint32Array: 4,
  Uint8ClampedArray: 1,
};

export const ArrayElementType = {
  Float32Array: "Float32",
  Float64Array: "Float64",
  Int8Array: "Int8",
  Int16Array: "Int16",
  Int32Array: "Int32",
  Uint8Array: "Uint8",
  Uint16Array: "Uint16",
  Uint32Array: "Uint32",
  Uint8ClampedArray: "Uint8Clamped",
};

// ECMA262 9.4.5.7
export function IntegerIndexedObjectCreate(
  realm: Realm,
  prototype: ObjectValue | AbstractObjectValue,
  internalSlotsList: { [key: string]: void }
): ObjectValue {
  // 1. Assert: internalSlotsList contains the names [[ViewedArrayBuffer]], [[ArrayLength]], [[ByteOffset]], and [[TypedArrayName]].
  invariant(
    "$ViewedArrayBuffer" in internalSlotsList &&
      "$ArrayLength" in internalSlotsList &&
      "$ByteOffset" in internalSlotsList &&
      "$TypedArrayName" in internalSlotsList
  );

  // 2. Let A be a newly created object with an internal slot for each name in internalSlotsList.
  let A = new IntegerIndexedExotic(realm);
  Object.assign(A, internalSlotsList);

  // 3. Set A's essential internal methods to the default ordinary object definitions specified in 9.1.
  // 4. Set the [[GetOwnProperty]] internal method of A as specified in 9.4.5.1.
  // 5. Set the [[HasProperty]] internal method of A as specified in 9.4.5.2.
  // 6. Set the [[DefineOwnProperty]] internal method of A as specified in 9.4.5.3.
  // 7. Set the [[Get]] internal method of A as specified in 9.4.5.4.
  // 8. Set the [[Set]] internal method of A as specified in 9.4.5.5.
  // 9. Set the [[OwnPropertyKeys]] internal method of A as specified in 9.4.5.6.

  // 10. Set A.[[Prototype]] to prototype.
  A.$Prototype = prototype;

  // 11. Set A.[[Extensible]] to true.
  A.setExtensible(true);

  // 12. Return A.
  return A;
}

// ECMA262 9.4.5.8
export function IntegerIndexedElementGet(realm: Realm, O: ObjectValue, index: number): NumberValue | UndefinedValue {
  // 1. Assert: Type(index) is Number.
  invariant(typeof index === "number", "Type(index) is Number");

  // 2. Assert: O is an Object that has [[ViewedArrayBuffer]], [[ArrayLength]], [[ByteOffset]], and [[TypedArrayName]] internal slots.
  invariant(
    O instanceof ObjectValue &&
      O.$ViewedArrayBuffer &&
      O.$ArrayLength !== undefined &&
      O.$ByteOffset !== undefined &&
      O.$TypedArrayName
  );

  // 3. Let buffer be O.[[ViewedArrayBuffer]].
  let buffer = O.$ViewedArrayBuffer;

  // 4. If IsDetachedBuffer(buffer) is true, throw a TypeError exception.
  if (IsDetachedBuffer(realm, buffer) === true) {
    throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError, "IsDetachedBuffer(buffer) is true");
  }

  // 5. If IsInteger(index) is false, return undefined.
  if (IsInteger(realm, index) === false) return realm.intrinsics.undefined;

  // 6. If index = -0, return undefined.
  if (Object.is(index, -0)) return realm.intrinsics.undefined;

  // 7. Let length be O.[[ArrayLength]].
  let length = O.$ArrayLength;
  invariant(typeof length === "number");

  // 8. If index < 0 or index ≥ length, return undefined.
  if (index < 0 || index >= length) return realm.intrinsics.undefined;

  // 9. Let offset be O.[[ByteOffset]].
  let offset = O.$ByteOffset;
  invariant(typeof offset === "number");

  // 10. Let arrayTypeName be the String value of O.[[TypedArrayName]].
  let arrayTypeName = O.$TypedArrayName;
  invariant(typeof arrayTypeName === "string");

  // 11. Let elementSize be the Number value of the Element Size value specified in Table 50 for arrayTypeName.
  let elementSize = ArrayElementSize[arrayTypeName];

  // 12. Let indexedPosition be (index × elementSize) + offset.
  let indexedPosition = index * elementSize + offset;

  // 13. Let elementType be the String value of the Element Type value in Table 50 for arrayTypeName.
  let elementType = ArrayElementType[arrayTypeName];

  // 14. Return GetValueFromBuffer(buffer, indexedPosition, elementType).
  return GetValueFromBuffer(realm, buffer, indexedPosition, elementType);
}

// ECMA262 9.4.5.9
export function IntegerIndexedElementSet(realm: Realm, O: ObjectValue, index: number, value: Value): boolean {
  // 1. Assert: Type(index) is Number.
  invariant(typeof index === "number", "Type(index) is Number");

  // 2. Assert: O is an Object that has [[ViewedArrayBuffer]], [[ArrayLength]], [[ByteOffset]], and [[TypedArrayName]] internal slots.
  invariant(
    O instanceof ObjectValue &&
      O.$ViewedArrayBuffer &&
      O.$ArrayLength !== undefined &&
      O.$ByteOffset !== undefined &&
      O.$TypedArrayName
  );

  // 3. Let numValue be ? ToNumber(value).
  let numValue = To.ToNumber(realm, value);

  // 4. Let buffer be O.[[ViewedArrayBuffer]].
  let buffer = O.$ViewedArrayBuffer;
  invariant(buffer);

  // 5. If IsDetachedBuffer(buffer) is true, throw a TypeError exception.
  if (IsDetachedBuffer(realm, buffer) === true) {
    throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError, "IsDetachedBuffer(buffer) is true");
  }

  // 6. If IsInteger(index) is false, return false.
  if (IsInteger(realm, index) === false) return false;

  // 7. If index = -0, return false.
  if (Object.is(index, -0)) return false;

  // 8. Let length be O.[[ArrayLength]].
  let length = O.$ArrayLength;
  invariant(typeof length === "number");

  // 9. If index < 0 or index ≥ length, return false.
  if (index < 0 || index >= length) return false;

  // 10. Let offset be O.[[ByteOffset]].
  let offset = O.$ByteOffset;
  invariant(typeof offset === "number");

  // 11. Let arrayTypeName be the String value of O.[[TypedArrayName]].
  let arrayTypeName = O.$TypedArrayName;
  invariant(typeof arrayTypeName === "string");

  // 12. Let elementSize be the Number value of the Element Size value specified in Table 50 for arrayTypeName.
  let elementSize = ArrayElementSize[arrayTypeName];

  // 13. Let indexedPosition be (index × elementSize) + offset.
  let indexedPosition = index * elementSize + offset;

  // 14. Let elementType be the String value of the Element Type value in Table 50 for arrayTypeName.
  let elementType = ArrayElementType[arrayTypeName];

  // 15. Perform SetValueInBuffer(buffer, indexedPosition, elementType, numValue).
  SetValueInBuffer(realm, buffer, indexedPosition, elementType, numValue);

  // 16. Return true.
  return true;
}

// ECMA262 22.2.3.5.1
export function ValidateTypedArray(realm: Realm, O: Value): ObjectValue {
  O = O.throwIfNotConcrete();

  // 1. If Type(O) is not Object, throw a TypeError exception.
  if (!(O instanceof ObjectValue)) {
    throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError, "Type(O) is not Object");
  }

  // 2. If O does not have a [[TypedArrayName]] internal slot, throw a TypeError exception.
  if (!O.$TypedArrayName) {
    throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError, "Type(O) is not Object");
  }

  // 3. Assert: O has a [[ViewedArrayBuffer]] internal slot.
  invariant(O.$ViewedArrayBuffer, "O has a [[ViewedArrayBuffer]] internal slot");

  // 4. Let buffer be O.[[ViewedArrayBuffer]].
  let buffer = O.$ViewedArrayBuffer;

  // 5. If IsDetachedBuffer(buffer) is true, throw a TypeError exception.
  if (IsDetachedBuffer(realm, buffer) === true) {
    throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError, "IsDetachedBuffer(buffer) is true");
  }

  // 6. Return buffer.
  return buffer;
}

// ECMA262 22.2.4.2.1
export function AllocateTypedArray(
  realm: Realm,
  constructorName: TypedArrayKind,
  newTarget: ObjectValue,
  defaultProto: string,
  length?: number
): ObjectValue {
  // 1. Let proto be ? GetPrototypeFromConstructor(newTarget, defaultProto).
  let proto = GetPrototypeFromConstructor(realm, newTarget, defaultProto);

  // 2. Let obj be IntegerIndexedObjectCreate(proto, « [[ViewedArrayBuffer]], [[TypedArrayName]], [[ByteLength]], [[ByteOffset]], [[ArrayLength]] »).
  let obj = IntegerIndexedObjectCreate(realm, proto, {
    $ViewedArrayBuffer: undefined,
    $TypedArrayName: undefined,
    $ByteLength: undefined,
    $ByteOffset: undefined,
    $ArrayLength: undefined,
  });

  // 3. Assert: obj.[[ViewedArrayBuffer]] is undefined.
  invariant(obj.$ViewedArrayBuffer === undefined);

  // 4. Set obj.[[TypedArrayName]] to constructorName.
  obj.$TypedArrayName = constructorName;

  // 5. If length was not passed, then
  if (length === undefined) {
    // a. Set obj.[[ByteLength]] to 0.
    obj.$ByteLength = 0;

    // b. Set obj.[[ByteOffset]] to 0.
    obj.$ByteOffset = 0;

    // c. Set obj.[[ArrayLength]] to 0.
    obj.$ArrayLength = 0;
  } else {
    // 6. Else,
    // a. Perform ? AllocateTypedArrayBuffer(obj, length).
    AllocateTypedArrayBuffer(realm, obj, length);
  }

  // 7. Return obj.
  return obj;
}

// ECMA262 22.2.4.2.2
export function AllocateTypedArrayBuffer(realm: Realm, O: ObjectValue, length: number): ObjectValue {
  // Note that O is a new object, and we can thus write to internal slots
  invariant(realm.isNewObject(O));

  // 1. Assert: O is an Object that has a [[ViewedArrayBuffer]] internal slot.
  invariant(
    O instanceof ObjectValue && "$ViewedArrayBuffer" in O,
    "O is an Object that has a [[ViewedArrayBuffer]] internal slot"
  );

  // 2. Assert: O.[[ViewedArrayBuffer]] is undefined.
  invariant(O.$ViewedArrayBuffer === undefined, "O.[[ViewedArrayBuffer]] is undefined");

  // 3. Assert: length ≥ 0.
  invariant(length >= 0, "length ≥ 0");

  // 4. Let constructorName be the String value of O.[[TypedArrayName]].
  let constructorName = O.$TypedArrayName;
  invariant(constructorName);

  // 5. Let elementSize be the Element Size value in Table 50 for constructorName.
  let elementSize = ArrayElementSize[constructorName];

  // 6. Let byteLength be elementSize × length.
  let byteLength = elementSize * length;

  // 7. Let data be ? AllocateArrayBuffer(%ArrayBuffer%, byteLength).
  let data = AllocateArrayBuffer(realm, realm.intrinsics.ArrayBuffer, byteLength);

  // 8. Set O.[[ViewedArrayBuffer]] to data.
  O.$ViewedArrayBuffer = data;

  // 9. Set O.[[ByteLength]] to byteLength.
  O.$ByteLength = byteLength;

  // 10. Set O.[[ByteOffset]] to 0.
  O.$ByteOffset = 0;

  // 11. Set O.[[ArrayLength]] to length.
  O.$ArrayLength = length;

  // 12. Return O.
  return O;
}

// ECMA262 22.2.4.6
export function TypedArrayCreate(realm: Realm, constructor: ObjectValue, argumentList: Array<Value>): ObjectValue {
  // 1. Let newTypedArray be ? Construct(constructor, argumentList).
  let newTypedArray = Construct(realm, constructor, argumentList).throwIfNotConcreteObject();

  // 2. Perform ? ValidateTypedArray(newTypedArray).
  ValidateTypedArray(realm, newTypedArray);

  // 3. If argumentList is a List of a single Number, then
  if (argumentList.length === 1 && argumentList[0].mightBeNumber()) {
    if (argumentList[0].mightNotBeNumber()) {
      invariant(argumentList[0] instanceof AbstractValue);
      AbstractValue.reportIntrospectionError(argumentList[0]);
      throw new FatalError();
    }
    // a. If newTypedArray.[[ArrayLength]] < argumentList[0], throw a TypeError exception.
    invariant(typeof newTypedArray.$ArrayLength === "number");
    if (newTypedArray.$ArrayLength < ((argumentList[0].throwIfNotConcrete(): any): NumberValue).value) {
      throw realm.createErrorThrowCompletion(
        realm.intrinsics.TypeError,
        "newTypedArray.[[ArrayLength]] < argumentList[0]"
      );
    }
  }

  // 4. Return newTypedArray.
  return newTypedArray;
}

// ECMA262 22.2.4.7
export function TypedArraySpeciesCreate(realm: Realm, exemplar: ObjectValue, argumentList: Array<Value>): ObjectValue {
  // 1. Assert: exemplar is an Object that has a [[TypedArrayName]] internal slot.
  invariant(exemplar instanceof ObjectValue && typeof exemplar.$TypedArrayName === "string");

  // 2. Let defaultConstructor be the intrinsic object listed in column one of Table 50 for exemplar.[[TypedArrayName]].
  invariant(typeof exemplar.$TypedArrayName === "string");
  let defaultConstructor = {
    Float32Array: realm.intrinsics.Float32Array,
    Float64Array: realm.intrinsics.Float64Array,
    Int8Array: realm.intrinsics.Int8Array,
    Int16Array: realm.intrinsics.Int16Array,
    Int32Array: realm.intrinsics.Int32Array,
    Uint8Array: realm.intrinsics.Uint8Array,
    Uint16Array: realm.intrinsics.Uint16Array,
    Uint32Array: realm.intrinsics.Uint32Array,
    Uint8ClampedArray: realm.intrinsics.Uint8ClampedArray,
  }[exemplar.$TypedArrayName];

  // 3. Let constructor be ? SpeciesConstructor(exemplar, defaultConstructor).
  let constructor = SpeciesConstructor(realm, exemplar, defaultConstructor);

  // 4. Return ? TypedArrayCreate(constructor, argumentList).
  return TypedArrayCreate(realm, constructor, argumentList);
}
