// Copyright (C) 2016 the V8 project authors. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.
/*---
esid: sec-ordinary-object-internal-methods-and-internal-slots-defineownproperty-p-desc
es6id: 9.1.6
description: >
  Replaces value field even if they pass in the SameValue algorithm, including
  distinct NaN values
info: |
  Previously, this method compared the "value" field using the SameValue
  algorithm (thereby ignoring distinct NaN values)

  ---

  [[DefineOwnProperty]] (P, Desc)

  1. Return ? OrdinaryDefineOwnProperty(O, P, Desc).

  9.1.6.1 OrdinaryDefineOwnProperty

  1. Let current be ? O.[[GetOwnProperty]](P).
  2. Let extensible be the value of the [[Extensible]] internal slot of O.
  3. Return ValidateAndApplyPropertyDescriptor(O, P, extensible, Desc,
     current).

  9.1.6.3 ValidateAndApplyPropertyDescriptor

  [...]
  7. Else if IsDataDescriptor(current) and IsDataDescriptor(Desc) are both true,
     then
    a. If the [[Configurable]] field of current is false, then
      [...]
    b. Else the [[Configurable]] field of current is true, so any change is
       acceptable.
  [...]
  9. If O is not undefined, then
    a. For each field of Desc that is present, set the corresponding attribute
       of the property named P of object O to the value of the field.
  10. Return true.
features: [Float64Array, Uint8Array]
includes: [nans.js]
---*/

var float = new Float64Array(1);
var ints = new Uint8Array(float.buffer);
var len = distinctNaNs.length;
var idx, jdx, subject, first, second;
function byteValue(value) {
  float[0] = value;
  return ints[0] + (ints[1] << 8) + (ints[2] << 16) + (ints[3] << 32) +
    (ints[4] << 64) + (ints[5] << 64) + (ints[6] << 128) + (ints[7] << 256);
}

/**
 * Iterate over each pair of distinct NaN values (with replacement). If two or
 * more suitable NaN values cannot be identified, the semantics under test
 * cannot be verified and this test is expected to pass without evaluating any
 * assertions.
 */
for (idx = 0; idx < len; ++idx) {
  for (jdx = 0 ; jdx < len; ++jdx) {
    first = distinctNaNs[idx];
    second = distinctNaNs[jdx];
    if (byteValue(first) === byteValue(second)) {
      continue;
    }

    subject = {};
    subject.prop = first;
    subject.prop = second;

    assert.sameValue(
      byteValue(subject.prop),
      byteValue(second),
      'Property value was re-set'
    );
  }
}
