/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow strict-local */

import type { Realm } from "../realm.js";
import type { DataBlock, ElementType } from "../types.js";
import { Value, ObjectValue, NumberValue, EmptyValue, NullValue, UndefinedValue } from "../values/index.js";
import { SpeciesConstructor } from "./construct.js";
import { IsConstructor } from "./index.js";
import { IsDetachedBuffer } from "./is.js";
import { Create, Properties, To } from "../singletons.js";
import invariant from "../invariant.js";
import { ElementSize } from "../types.js";

// ECMA262 6.2.6.1
export function CreateByteDataBlock(realm: Realm, size: number): DataBlock {
  // 1. Assert: size≥0.
  invariant(size >= 0, "size >= 0");

  // 2. Let db be a new Data Block value consisting of size bytes. If it is impossible to create such a Data Block, throw a RangeError exception.
  let db;
  try {
    db = new Uint8Array(size);
  } catch (e) {
    if (e instanceof RangeError) {
      throw realm.createErrorThrowCompletion(realm.intrinsics.RangeError, "Invalid typed array length");
    } else {
      throw e;
    }
  }

  // 3. Set all of the bytes of db to 0.
  for (let i = 0; i < size; ++i) {
    db[i] = 0;
  }

  // 4. Return db.
  return db;
}

// ECMA262 6.2.6.2
export function CopyDataBlockBytes(
  realm: Realm,
  toBlock: DataBlock,
  _toIndex: number,
  fromBlock: DataBlock,
  _fromIndex: number,
  _count: number
): EmptyValue {
  let toIndex = _toIndex;
  let fromIndex = _fromIndex;
  let count = _count;
  // 1. Assert: fromBlock and toBlock are distinct Data Block values.
  invariant(toBlock instanceof Uint8Array && fromBlock instanceof Uint8Array && toBlock !== fromBlock);

  // 2. Assert: fromIndex, toIndex, and count are integer values ≥ 0.
  invariant(toIndex >= 0 && fromIndex >= 0 && count >= 0);

  // 3. Let fromSize be the number of bytes in fromBlock.
  let fromSize = fromBlock.length;

  // 4. Assert: fromIndex+count ≤ fromSize.
  invariant(fromIndex + count <= fromSize, "fromIndex+count ≤ fromSize");

  // 5. Let toSize be the number of bytes in toBlock.
  let toSize = toBlock.length;

  // 6. Assert: toIndex+count ≤ toSize.
  invariant(toIndex + count <= toSize, "toIndex+count ≤ toSize");

  // 7. Repeat, while count>0
  while (count > 0) {
    // a. Set toBlock[toIndex] to the value of fromBlock[fromIndex].
    toBlock[toIndex] = fromBlock[fromIndex];

    // b. Increment toIndex and fromIndex each by 1.
    toIndex += 1;
    fromIndex += 1;

    // c. Decrement count by 1.
    count -= 1;
  }

  // 8. Return NormalCompletion(empty).
  return realm.intrinsics.empty;
}

// ECMA262 24.1.1.1
export function AllocateArrayBuffer(realm: Realm, constructor: ObjectValue, byteLength: number): ObjectValue {
  // 1. Let obj be ? OrdinaryCreateFromConstructor(constructor, "%ArrayBufferPrototype%", « [[ArrayBufferData]], [[ArrayBufferByteLength]] »).
  let obj = Create.OrdinaryCreateFromConstructor(realm, constructor, "ArrayBufferPrototype", {
    $ArrayBufferData: undefined,
    $ArrayBufferByteLength: undefined,
  });

  // 2. Assert: byteLength is an integer value ≥ 0.
  invariant(typeof byteLength === "number" && byteLength >= 0, "byteLength is an integer value ≥ 0");

  // 3. Let block be ? CreateByteDataBlock(byteLength).
  let block = CreateByteDataBlock(realm, byteLength);

  // 4. Set obj's [[ArrayBufferData]] internal slot to block.
  obj.$ArrayBufferData = block;

  // 5. Set obj's [[ArrayBufferByteLength]] internal slot to byteLength.
  obj.$ArrayBufferByteLength = byteLength;

  // 6. Return obj.
  return obj;
}

// ECMA262 24.1.1.3
export function DetachArrayBuffer(realm: Realm, arrayBuffer: ObjectValue): NullValue {
  // 1. Assert: Type(arrayBuffer) is Object and it has [[ArrayBufferData]] and [[ArrayBufferByteLength]] internal slots.
  invariant(
    arrayBuffer instanceof ObjectValue && "$ArrayBufferData" in arrayBuffer && "$ArrayBufferByteLength" in arrayBuffer
  );

  // 2. Set arrayBuffer.[[ArrayBufferData]] to null.
  Properties.ThrowIfInternalSlotNotWritable(realm, arrayBuffer, "$ArrayBufferData").$ArrayBufferData = null;

  // 3. Set arrayBuffer.[[ArrayBufferByteLength]] to 0.
  Properties.ThrowIfInternalSlotNotWritable(realm, arrayBuffer, "$ArrayBufferByteLength").$ArrayBufferByteLength = 0;

  // 4. Return NormalCompletion(null).
  return realm.intrinsics.null;
}

// ECMA262 24.2.1.1
export function GetViewValue(
  realm: Realm,
  _view: Value,
  requestIndex: Value,
  isLittleEndian: Value,
  type: ElementType
): NumberValue {
  let view = _view.throwIfNotConcrete();

  // 1. If Type(view) is not Object, throw a TypeError exception.
  if (!(view instanceof ObjectValue)) {
    throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError, "Type(view) is not Object");
  }

  // 2. If view does not have a [[DataView]] internal slot, throw a TypeError exception.
  if (!("$DataView" in view)) {
    throw realm.createErrorThrowCompletion(
      realm.intrinsics.TypeError,
      "view does not have a [[DataView]] internal slot"
    );
  }

  // 3. Assert: view has a [[ViewedArrayBuffer]] internal slot.
  invariant(view.$ViewedArrayBuffer);

  // 4. Let getIndex be ? ToIndex(requestIndex).
  let getIndex = To.ToIndexPartial(realm, requestIndex);

  // 5. Let littleEndian be ToBoolean(isLittleEndian).
  let littleEndian = To.ToBooleanPartial(realm, isLittleEndian);

  // 6. Let buffer be view.[[ViewedArrayBuffer]].
  let buffer = view.$ViewedArrayBuffer;
  invariant(buffer);

  // 7. If IsDetachedBuffer(buffer) is true, throw a TypeError exception.
  if (IsDetachedBuffer(realm, buffer) === true) {
    throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError, "IsDetachedBuffer(buffer) is true");
  }

  // 8. Let viewOffset be view.[[ByteOffset]].
  let viewOffset = view.$ByteOffset;
  invariant(typeof viewOffset === "number");

  // 9. Let viewSize be view.[[ByteLength]].
  let viewSize = view.$ByteLength;
  invariant(typeof viewSize === "number");

  // 10. Let elementSize be the Number value of the Element Size value specified in Table 50 for Element Type type.
  let elementSize = ElementSize[type];

  // 11. If getIndex + elementSize > viewSize, throw a RangeError exception.
  if (getIndex + elementSize > viewSize) {
    throw realm.createErrorThrowCompletion(realm.intrinsics.RangeError, "getIndex + elementSize > viewSize");
  }

  // 12. Let bufferIndex be getIndex + viewOffset.
  let bufferIndex = getIndex + viewOffset;

  // 13. Return GetValueFromBuffer(buffer, bufferIndex, type, littleEndian).
  return GetValueFromBuffer(realm, buffer, bufferIndex, type, littleEndian);
}

// ECMA262 24.1.1.5
export function GetValueFromBuffer(
  realm: Realm,
  arrayBuffer: ObjectValue,
  byteIndex: number,
  type: ElementType,
  _isLittleEndian?: boolean
): NumberValue {
  let isLittleEndian = _isLittleEndian;
  // 1. Assert: IsDetachedBuffer(arrayBuffer) is false.
  invariant(IsDetachedBuffer(realm, arrayBuffer) === false);

  // 2. Assert: There are sufficient bytes in arrayBuffer starting at byteIndex to represent a value of type.
  invariant(
    arrayBuffer.$ArrayBufferData instanceof Uint8Array &&
      byteIndex + ElementSize[type] <= arrayBuffer.$ArrayBufferData.length
  );

  // 3. Assert: byteIndex is an integer value ≥ 0.
  invariant(byteIndex >= 0);

  // 4. Let block be arrayBuffer.[[ArrayBufferData]].
  let block = arrayBuffer.$ArrayBufferData;
  invariant(block instanceof Uint8Array);

  // 5. Let elementSize be the Number value of the Element Size value specified in Table 50 for Element Type type.
  let elementSize = ElementSize[type];

  // 6. Let rawValue be a List of elementSize containing, in order, the elementSize sequence of bytes starting with block[byteIndex].
  let rawValue = new DataView(block.buffer, byteIndex, elementSize);

  // 7. If isLittleEndian is not present, set isLittleEndian to either true or false. The choice is implementation dependent and should be the alternative that is most efficient for the implementation. An implementation must use the same value each time this step is executed and the same value must be used for the corresponding step in the SetValueInBuffer abstract operation.
  if (isLittleEndian === undefined) isLittleEndian = true;

  // 8. If isLittleEndian is false, reverse the order of the elements of rawValue.

  // 9. If type is "Float32", then
  if (type === "Float32") {
    // a. Let value be the byte elements of rawValue concatenated and interpreted as a little-endian bit string encoding of an IEEE 754-2008 binary32 value.
    // b. If value is an IEEE 754-2008 binary32 NaN value, return the NaN Number value.
    // c. Return the Number value that corresponds to value.
    return new NumberValue(realm, rawValue.getFloat32(0, isLittleEndian));
  }

  // 10. If type is "Float64", then
  if (type === "Float64") {
    // a. Let value be the byte elements of rawValue concatenated and interpreted as a little-endian bit string encoding of an IEEE 754-2008 binary64 value.
    // b. If value is an IEEE 754-2008 binary64 NaN value, return the NaN Number value.
    // c. Return the Number value that corresponds to value.
    return new NumberValue(realm, rawValue.getFloat64(0, isLittleEndian));
  }

  let intValue;
  // 11. If the first code unit of type is "U", then
  if (type === "Uint8" || type === "Uint16" || type === "Uint32" || type === "Uint8Clamped") {
    // a. Let intValue be the byte elements of rawValue concatenated and interpreted as a bit string encoding of an unsigned little-endian binary number.
    if (elementSize === 1) {
      intValue = rawValue.getUint8(0);
    } else if (elementSize === 2) {
      intValue = rawValue.getUint16(0, isLittleEndian);
    } else {
      intValue = rawValue.getUint32(0, isLittleEndian);
    }
  } else {
    // 12. Else,
    // a. Let intValue be the byte elements of rawValue concatenated and interpreted as a bit string encoding of a binary little-endian 2's complement number of bit length elementSize × 8.
    if (elementSize === 1) {
      intValue = rawValue.getInt8(0);
    } else if (elementSize === 2) {
      intValue = rawValue.getInt16(0, isLittleEndian);
    } else {
      intValue = rawValue.getInt32(0, isLittleEndian);
    }
  }

  // 13. Return the Number value that corresponds to intValue.
  return new NumberValue(realm, intValue);
}

// ECMA262 24.2.1.2
export function SetViewValue(
  realm: Realm,
  _view: Value,
  requestIndex: Value,
  isLittleEndian: Value,
  type: ElementType,
  value: Value
): UndefinedValue {
  let view = _view.throwIfNotConcrete();

  // 1. If Type(view) is not Object, throw a TypeError exception.
  if (!(view instanceof ObjectValue)) {
    throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError, "Type(view) is not Object");
  }

  // 2. If view does not have a [[DataView]] internal slot, throw a TypeError exception.
  if (!("$DataView" in view)) {
    throw realm.createErrorThrowCompletion(
      realm.intrinsics.TypeError,
      "view does not have a [[DataView]] internal slot"
    );
  }

  // 3. Assert: view has a [[ViewedArrayBuffer]] internal slot.
  invariant(view.$ViewedArrayBuffer);

  // 4. Let getIndex be ? ToIndex(requestIndex).
  let getIndex = To.ToIndexPartial(realm, requestIndex);

  // 5. Let numberValue be ? ToNumber(value).
  let numberValue = To.ToNumber(realm, value);

  // 6. Let littleEndian be ToBoolean(isLittleEndian).
  let littleEndian = To.ToBooleanPartial(realm, isLittleEndian);

  // 7. Let buffer be view.[[ViewedArrayBuffer]].
  let buffer = view.$ViewedArrayBuffer;
  invariant(buffer);

  // 8. If IsDetachedBuffer(buffer) is true, throw a TypeError exception.
  if (IsDetachedBuffer(realm, buffer) === true) {
    throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError, "IsDetachedBuffer(buffer) is true");
  }

  // 9. Let viewOffset be view.[[ByteOffset]].
  let viewOffset = view.$ByteOffset;
  invariant(typeof viewOffset === "number");

  // 10. Let viewSize be view.[[ByteLength]].
  let viewSize = view.$ByteLength;
  invariant(typeof viewSize === "number");

  // 11. Let elementSize be the Number value of the Element Size value specified in Table 50 for Element Type type.
  let elementSize = ElementSize[type];

  // 12. If getIndex + elementSize > viewSize, throw a RangeError exception.
  if (getIndex + elementSize > viewSize) {
    throw realm.createErrorThrowCompletion(realm.intrinsics.RangeError, "getIndex + elementSize > viewSize");
  }

  // 13. Let bufferIndex be getIndex + viewOffset.
  let bufferIndex = getIndex + viewOffset;

  // 14. Return SetValueInBuffer(buffer, bufferIndex, type, numberValue, littleEndian).
  return SetValueInBuffer(realm, buffer, bufferIndex, type, numberValue, littleEndian);
}

// ECMA262 24.1.1.4
export function CloneArrayBuffer(
  realm: Realm,
  srcBuffer: ObjectValue,
  srcByteOffset: number,
  _cloneConstructor?: ObjectValue
): ObjectValue {
  let cloneConstructor = _cloneConstructor;
  // 1. Assert: Type(srcBuffer) is Object and it has an [[ArrayBufferData]] internal slot.
  invariant(srcBuffer instanceof ObjectValue && srcBuffer.$ArrayBufferData);

  // 2. If cloneConstructor is not present, then
  if (cloneConstructor === undefined) {
    // a. Let cloneConstructor be ? SpeciesConstructor(srcBuffer, %ArrayBuffer%).
    cloneConstructor = SpeciesConstructor(realm, srcBuffer, realm.intrinsics.ArrayBuffer);

    // b. If IsDetachedBuffer(srcBuffer) is true, throw a TypeError exception.
    if (IsDetachedBuffer(realm, srcBuffer) === true) {
      throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError, "IsDetachedBuffer(srcBuffer) is true");
    }
  } else {
    // 3. Else, Assert: IsConstructor(cloneConstructor) is true.
    invariant(IsConstructor(realm, cloneConstructor) === true, "IsConstructor(cloneConstructor) is true");
  }

  // 4. Let srcLength be the value of srcBuffer's [[ArrayBufferByteLength]] internal slot.
  let srcLength = srcBuffer.$ArrayBufferByteLength;
  invariant(typeof srcLength === "number");

  // 5. Assert: srcByteOffset ≤ srcLength.
  invariant(srcByteOffset <= srcLength, "srcByteOffset ≤ srcLength");

  // 6. Let cloneLength be srcLength - srcByteOffset.
  let cloneLength = srcLength - srcByteOffset;

  // 7. Let srcBlock be srcBuffer.[[ArrayBufferData]].
  let srcBlock = srcBuffer.$ArrayBufferData;
  invariant(srcBlock);

  // 8. Let targetBuffer be ? AllocateArrayBuffer(cloneConstructor, srcLength).
  let targetBuffer = AllocateArrayBuffer(realm, (cloneConstructor: ObjectValue), srcLength);

  // 9. If IsDetachedBuffer(srcBuffer) is true, throw a TypeError exception.
  if (IsDetachedBuffer(realm, srcBuffer) === true) {
    throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError, "IsDetachedBuffer(srcBuffer) is true");
  }

  // 10. Let targetBlock be targetBuffer.[[ArrayBufferData]].
  let targetBlock = targetBuffer.$ArrayBufferData;
  invariant(targetBlock);

  // 11. Perform CopyDataBlockBytes(targetBlock, 0, srcBlock, srcByteOffset, cloneLength).
  CopyDataBlockBytes(realm, targetBlock, 0, srcBlock, srcByteOffset, cloneLength);

  // 12. Return targetBuffer.
  return targetBuffer;
}

// ECMA262 24.1.1.6
export function SetValueInBuffer(
  realm: Realm,
  arrayBuffer: ObjectValue,
  byteIndex: number,
  type: ElementType,
  value: number,
  _isLittleEndian?: boolean
): UndefinedValue {
  let isLittleEndian = _isLittleEndian;
  // 1. Assert: IsDetachedBuffer(arrayBuffer) is false.
  invariant(IsDetachedBuffer(realm, arrayBuffer) === false);

  // 2. Assert: There are sufficient bytes in arrayBuffer starting at byteIndex to represent a value of type.
  invariant(
    arrayBuffer.$ArrayBufferData instanceof Uint8Array &&
      byteIndex + ElementSize[type] <= arrayBuffer.$ArrayBufferData.length
  );

  // 3. Assert: byteIndex is an integer value ≥ 0.
  invariant(byteIndex >= 0);

  // 4. Assert: Type(value) is Number.
  invariant(typeof value === "number");

  // 5. Let block be arrayBuffer.[[ArrayBufferData]].
  let block = Properties.ThrowIfInternalSlotNotWritable(realm, arrayBuffer, "$ArrayBufferData").$ArrayBufferData;

  // 6. Assert: block is not undefined.
  invariant(block instanceof Uint8Array);

  // 7. If isLittleEndian is not present, set isLittleEndian to either true or false. The choice is implementation dependent and should be the alternative that is most efficient for the implementation. An implementation must use the same value each time this step is executed and the same value must be used for the corresponding step in the SetValueInBuffer abstract operation.
  if (isLittleEndian === undefined) isLittleEndian = true;

  let rawBytes = new Uint8Array(ElementSize[type]);
  // 8. If type is "Float32", then
  if (type === "Float32") {
    // a. Set rawBytes to a List containing the 4 bytes that are the result of converting value to IEEE 754-2008 binary32 format using “Round to nearest, ties to even” rounding mode. If isLittleEndian is false, the bytes are arranged in big endian order. Otherwise, the bytes are arranged in little endian order. If value is NaN, rawValue may be set to any implementation chosen IEEE 754-2008 binary32 format Not-a-Number encoding. An implementation must always choose the same encoding for each implementation distinguishable NaN value.
    new DataView(rawBytes.buffer).setFloat32(0, value, isLittleEndian);
  } else if (type === "Float64") {
    // 9. Else if type is "Float64", then
    // a. Set rawBytes to a List containing the 8 bytes that are the IEEE 754-2008 binary64 format encoding of value. If isLittleEndian is false, the bytes are arranged in big endian order. Otherwise, the bytes are arranged in little endian order. If value is NaN, rawValue may be set to any implementation chosen IEEE 754-2008 binary64 format Not-a-Number encoding. An implementation must always choose the same encoding for each implementation distinguishable NaN value.
    new DataView(rawBytes.buffer).setFloat64(0, value, isLittleEndian);
  } else {
    // 10. Else,
    // a. Let n be the Number value of the Element Size specified in Table 50 for Element Type type.
    let n = ElementSize[type];

    // b. Let convOp be the abstract operation named in the Conversion Operation column in Table 50 for Element Type type.
    let convOp = To.ElementConv[type];

    // c. Let intValue be convOp(value).
    let intValue = convOp(realm, value);

    // d. If intValue ≥ 0, then
    if (intValue > 0) {
      // i. Let rawBytes be a List containing the n-byte binary encoding of intValue. If isLittleEndian is false, the bytes are ordered in big endian order. Otherwise, the bytes are ordered in little endian order.
      if (n === 1) {
        new DataView(rawBytes.buffer).setUint8(0, intValue);
      } else if (n === 2) {
        new DataView(rawBytes.buffer).setUint16(0, intValue, isLittleEndian);
      } else if (n === 4) {
        new DataView(rawBytes.buffer).setUint32(0, intValue, isLittleEndian);
      } else {
        invariant(false);
      }
    } else {
      // e. Else,
      // i. Let rawBytes be a List containing the n-byte binary 2's complement encoding of intValue. If isLittleEndian is false, the bytes are ordered in big endian order. Otherwise, the bytes are ordered in little endian order.
      if (n === 1) {
        new DataView(rawBytes.buffer).setInt8(0, intValue);
      } else if (n === 2) {
        new DataView(rawBytes.buffer).setInt16(0, intValue, isLittleEndian);
      } else if (n === 4) {
        new DataView(rawBytes.buffer).setInt32(0, intValue, isLittleEndian);
      } else {
        invariant(false);
      }
    }
  }

  // 11. Store the individual bytes of rawBytes into block, in order, starting at block[byteIndex].
  for (let i = 0; i < rawBytes.length; ++i) {
    block[byteIndex + i] = rawBytes[i];
  }

  // 12. Return NormalCompletion(undefined).
  return realm.intrinsics.undefined;
}
