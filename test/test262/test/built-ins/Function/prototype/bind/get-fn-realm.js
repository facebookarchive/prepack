// Copyright (C) 2016 the V8 project authors. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.
/*---
esid: sec-getfunctionrealm
es6id: 7.3.22
description: >
    The realm of a bound function exotic object is the realm of its target
    function
info: |
    [...]
    2. If obj has a [[Realm]] internal slot, then
       a, Return obj's [[Realm]] internal slot.
    3. If obj is a Bound Function exotic object, then
       a. Let target be obj's [[BoundTargetFunction]] internal slot.
       b. Return ? GetFunctionRealm(target).
---*/

var other = $262.createRealm().global;
var C = new other.Function();
var B = Function.prototype.bind.call(C);

assert.sameValue(Object.getPrototypeOf(new B()), C.prototype);
