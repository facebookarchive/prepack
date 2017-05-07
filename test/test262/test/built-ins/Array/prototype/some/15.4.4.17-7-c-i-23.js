// Copyright (c) 2012 Ecma International.  All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.

/*---
es5id: 15.4.4.17-7-c-i-23
description: >
    Array.prototype.some - This object is an global object which
    contains index property
---*/

        function callbackfn(val, idx, obj) {
            if (idx === 0) {
                return val === 11;
            }
            return false;
        }

            this[0] = 11;
            this.length = 1;

assert(Array.prototype.some.call(this, callbackfn), 'Array.prototype.some.call(this, callbackfn) !== true');
