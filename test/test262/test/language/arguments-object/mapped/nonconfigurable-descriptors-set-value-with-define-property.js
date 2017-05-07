// Copyright (C) 2017 Caio Lima. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.

/*---
description: Mapped arguments property descriptor change with non-configurable property
info: >
    Mapping keep working when property is set to non-configurable and its
    value is changed using [[DefineOwnProperty]].
flags: [noStrict]
esid: sec-arguments-exotic-objects-defineownproperty-p-desc
includes: [propertyHelper.js]
---*/

function setArgumentValueWithDefineOwnProperty(a) {
  Object.defineProperty(arguments, "0", {configurable: false});

  Object.defineProperty(arguments, "0", {value: 2});

  let propertyDescriptor = Object.getOwnPropertyDescriptor(arguments, "0");
  assert.sameValue(propertyDescriptor.value, 2);
  assert.sameValue(a, 2);
  verifyEnumerable(arguments, "0");
  verifyWritable(arguments, "0");
  verifyNotConfigurable(arguments, "0");
}
setArgumentValueWithDefineOwnProperty(1);

