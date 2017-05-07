// Copyright (C) 2016 the V8 project authors. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.
/*---
esid: sec-proxy-object-internal-methods-and-internal-slots-ownpropertykeys
es6id: 9.5.12
description: >
  Throws if trap is not callable (honoring the Realm of the current execution
  context)
info: |
    [[OwnPropertyKeys]] ( )

    5. Let trap be GetMethod(handler, "ownKeys").
    ...

    7.3.9 GetMethod (O, P)

    5. If IsCallable(func) is false, throw a TypeError exception.
---*/

var OProxy = $262.createRealm().global.Proxy;
var p = new OProxy({attr:1}, {
  ownKeys: {}
});

assert.throws(TypeError, function() {
  Object.keys(p);
});
