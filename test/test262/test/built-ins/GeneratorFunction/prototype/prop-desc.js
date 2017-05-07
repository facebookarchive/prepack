// Copyright (C) 2015 the V8 project authors. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.
/*---
es6id: 25.4.5.1
description: GeneratorFunction.prototype property descriptor
info: >
  This property has the attributes { [[Writable]]: false, [[Enumerable]]:
  false, [[Configurable]]: false }.
includes: [propertyHelper.js]
---*/

var GeneratorFunction = Object.getPrototypeOf(function* () {}).constructor;

verifyNotEnumerable(GeneratorFunction, 'prototype');
verifyNotWritable(GeneratorFunction, 'prototype');
verifyNotConfigurable(GeneratorFunction, 'prototype');
