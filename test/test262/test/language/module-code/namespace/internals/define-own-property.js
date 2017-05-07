// Copyright (C) 2016 the V8 project authors. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.
/*---
esid: sec-module-namespace-exotic-objects-defineownproperty-p-desc
description: >
    The [[DefineOwnProperty]] internal method consistently returns `false`
info: |
    1. Return false.
flags: [module]
features: [Reflect, Symbol, Symbol.toStringTag]
---*/

import * as ns from './define-own-property.js';
export var local1;
var local2;
export { local2 as renamed };
export { local1 as indirect } from './define-own-property.js';
var sym = Symbol('test262');

assert.sameValue(
  Reflect.defineProperty(ns, 'local1', {}),
  false,
  'Reflect.defineProperty: local1'
);
assert.throws(TypeError, function() {
  Object.defineProperty(ns, 'local1', {});
}, 'Object.defineProperty: local1');

assert.sameValue(
  Reflect.defineProperty(ns, 'local2', {}),
  false,
  'Reflect.defineProperty: local2'
);
assert.throws(TypeError, function() {
  Object.defineProperty(ns, 'local2', {});
}, 'Object.defineProperty: local2');

assert.sameValue(
  Reflect.defineProperty(ns, 'renamed', {}),
  false,
  'Reflect.defineProperty: renamed'
);
assert.throws(TypeError, function() {
  Object.defineProperty(ns, 'renamed', {});
}, 'Object.defineProperty: renamed');

assert.sameValue(
  Reflect.defineProperty(ns, 'indirect', {}),
  false,
  'Reflect.defineProperty: indirect'
);
assert.throws(TypeError, function() {
  Object.defineProperty(ns, 'indirect', {});
}, 'Object.defineProperty: indirect');

assert.sameValue(
  Reflect.defineProperty(ns, 'default', {}),
  false,
  'Reflect.defineProperty: default'
);
assert.throws(TypeError, function() {
  Object.defineProperty(ns, 'default', {});
}, 'Object.defineProperty: default');

assert.sameValue(
  Reflect.defineProperty(ns, Symbol.toStringTag, {}),
  false,
  'Reflect.defineProperty: Symbol.toStringTag'
);
assert.throws(TypeError, function() {
  Object.defineProperty(ns, Symbol.toStringTag, {});
}, 'Object.defineProperty: Symbol.toStringTag');

assert.sameValue(
  Reflect.defineProperty(ns, sym, {}), false, 'Reflect.defineProperty: sym'
);
assert.throws(TypeError, function() {
  Object.defineProperty(ns, sym, {});
}, 'Object.defineProperty: symbol');
