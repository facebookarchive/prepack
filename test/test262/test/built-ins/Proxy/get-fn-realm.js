// Copyright (C) 2016 the V8 project authors. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.
/*---
esid: sec-getfunctionrealm
es6id: 7.3.22
description: >
    The realm of a proxy exotic object is the realm of its target function
info: |
    [...]
    2. If obj has a [[Realm]] internal slot, then
       a, Return obj's [[Realm]] internal slot.
    3. If obj is a Bound Function exotic object, then
       [...]
    4. If obj is a Proxy exotic object, then
       a. If the value of the [[ProxyHandler]] internal slot of obj is null,
          throw a TypeError exception.
       b. Let proxyTarget be the value of obj's [[ProxyTarget]] internal slot.
       c. Return ? GetFunctionRealm(proxyTarget).
---*/

var other = $262.createRealm().global;
var C = new other.Function();
// Ensure that the proxy does not report a `prototype` property
var P = new Proxy(C, { get: function() {} });

assert.sameValue(Object.getPrototypeOf(new P()), other.Object.prototype);
