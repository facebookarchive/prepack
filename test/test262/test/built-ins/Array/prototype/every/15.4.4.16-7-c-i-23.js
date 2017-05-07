// Copyright (c) 2012 Ecma International.  All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.

/*---
es5id: 15.4.4.16-7-c-i-23
description: >
    Array.prototype.every - This object is an global object which
    contains index property
---*/

        function callbackfn(val, idx, obj) {
            if (idx === 0) {
                return val !== 11;
            } else {
                return true;
            }
        }

            this[0] = 11;
            this.length = 1;

assert.sameValue(Array.prototype.every.call(this, callbackfn), false, 'Array.prototype.every.call(this, callbackfn)');
