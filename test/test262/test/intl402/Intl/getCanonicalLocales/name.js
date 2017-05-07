// Copyright 2016 Mozilla Corporation. All rights reserved.
// This code is governed by the license found in the LICENSE file.

/*---
esid: sec-intl.getcanonicallocales
description: Intl.getCanonicalLocales.name value and descriptor. 
info: |
  8.2.1 Intl.getCanonicalLocales (locales)
  1. Let ll be ? CanonicalizeLocaleList(locales).
  2. Return CreateArrayFromList(ll).
includes: [propertyHelper.js]
---*/

assert.sameValue(Intl.getCanonicalLocales.name, 'getCanonicalLocales',
  'The value of `Intl.getCanonicalLocales.name` is `"getCanonicalLocales"`'
);

verifyNotEnumerable(Intl.getCanonicalLocales, 'name');
verifyNotWritable(Intl.getCanonicalLocales, 'name');
verifyConfigurable(Intl.getCanonicalLocales, 'name');
