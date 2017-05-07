// Copyright (c) 2012 Ecma International.  All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.

/*---
es5id: 15.4.4.17-7-c-iii-26
description: >
    Array.prototype.some - return value of callbackfn is the global
    object
---*/

var global = this;
        function callbackfn(val, idx, obj) {
            return global;
        }

assert([11].some(callbackfn), '[11].some(callbackfn) !== true');
