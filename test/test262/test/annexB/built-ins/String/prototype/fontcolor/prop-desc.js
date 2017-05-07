// Copyright (C) 2016 the V8 project authors. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.
/*---
esid: sec-string.prototype.fontcolor
es6id: B.2.3.7
description: Property descriptor for String.prototype.fontcolor
info: >
    Every other data property described in clauses 18 through 26 and in Annex
    B.2 has the attributes { [[Writable]]: true, [[Enumerable]]: false,
    [[Configurable]]: true } unless otherwise specified.
includes: [propertyHelper.js]
---*/

verifyNotEnumerable(String.prototype, 'fontcolor');
verifyWritable(String.prototype, 'fontcolor');
verifyConfigurable(String.prototype, 'fontcolor');
