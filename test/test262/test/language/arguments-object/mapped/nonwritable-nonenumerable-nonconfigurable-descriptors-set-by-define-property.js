// Copyright (C) 2017 Caio Lima. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.

/*---
description: Mapped arguments property descriptor change to non-writable, non-enumerable and non-configurable
info: >
    Change the  descriptor using [[DefineOwnProperty]] to
    {writable: false, enumerable: false}, change argument[0]
    value to 2 using [[DefineOwnProperty]] and then
    change property descriptor to {configurable: false}.
    The descriptor's enumerable property continues with its configured value.
flags: [noStrict]
esid: sec-arguments-exotic-objects-defineownproperty-p-desc
includes: [propertyHelper.js]
---*/

function fn(a) {
  Object.defineProperty(arguments, "0", {writable: false, enumerable: false, value: 2, configurable: false});

  let propertyDescriptor = Object.getOwnPropertyDescriptor(arguments, "0");
  assert.sameValue(propertyDescriptor.value, 2);
  assert.sameValue(arguments[0], 2);
  verifyNotEnumerable(arguments, "0");
  verifyNotWritable(arguments, "0");
  verifyNotConfigurable(arguments, "0");
}
fn(1);
