// Copyright (C) 2016 the V8 project authors. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.
/*---
esid: sec-intl.getcanonicallocales
description: >
  Tests that the value returned by getCanonicalLocales is a mutable array.
info: |
  8.2.1 Intl.getCanonicalLocales (locales)
  1. Let ll be ? CanonicalizeLocaleList(locales).
  2. Return CreateArrayFromList(ll).
includes: [propertyHelper.js]
---*/

var locales = ['en-US', 'fr'];
var result = Intl.getCanonicalLocales(locales);

verifyEnumerable(result, 0);
verifyWritable(result, 0);
verifyConfigurable(result, 0);

result = Intl.getCanonicalLocales(locales);
verifyEnumerable(result, 1);
verifyWritable(result, 1);
verifyConfigurable(result, 1);

result = Intl.getCanonicalLocales(locales);
verifyNotEnumerable(result, 'length');
verifyNotConfigurable(result, 'length');

assert.sameValue(result.length, 2);
result.length = 42;
assert.sameValue(result.length, 42);
assert.throws(RangeError, function() {
  result.length = "Leo";
}, "a non-numeric value can't be set to result.length");
