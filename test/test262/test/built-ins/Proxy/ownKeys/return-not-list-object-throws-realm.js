// Copyright (C) 2016 the V8 project authors. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.
/*---
esid: sec-proxy-object-internal-methods-and-internal-slots-ownpropertykeys
es6id: 9.5.12
description: >
    If return is not a list object, throw a TypeError exception  (honoring
    the Realm of the current execution context)
info: |
    ...
    7. Let trapResultArray be ? Call(trap, handler, « target »).
    8. Let trapResult be ? CreateListFromArrayLike(trapResultArray, « String,
       Symbol »).
    ...

    7.3.17 CreateListFromArrayLike (obj [, elementTypes] )

    ...
    3. If Type(obj) is not Object, throw a TypeError exception.
features: [Symbol]
---*/

var other = $262.createRealm().global;
var p = new other.Proxy({}, {
    ownKeys: function() {
        return undefined;
    }
});

assert.throws(TypeError, function() {
    Object.keys(p);
});
