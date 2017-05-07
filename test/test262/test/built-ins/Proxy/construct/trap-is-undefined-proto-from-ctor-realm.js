// Copyright (C) 2016 the V8 project authors. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.
/*---
esid: sec-proxy-object-internal-methods-and-internal-slots-construct-argumentslist-newtarget
es6id: 9.5.14
description: >
    If trap is undefined, propagate the construct to the target object,
    honoring the Realm of the newTarget value
info: >
    [[Construct]] ( argumentsList, newTarget)

    7. If trap is undefined, then
        b. Return Construct(target, argumentsList, newTarget).

    9.1.14 GetPrototypeFromConstructor

    [...]
    3. Let proto be ? Get(constructor, "prototype").
    4. If Type(proto) is not Object, then
       a. Let realm be ? GetFunctionRealm(constructor).
       b. Let proto be realm's intrinsic object named intrinsicDefaultProto.
    [...]
features: [Reflect]
---*/

var other = $262.createRealm().global;
var C = new other.Function();
C.prototype = null;

var P = new Proxy(function() {}, {});

var p = Reflect.construct(P, [], C);

assert.sameValue(Object.getPrototypeOf(p), other.Object.prototype);
