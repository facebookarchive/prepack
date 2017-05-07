// Copyright (c) 2012 Ecma International.  All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.

/*---
es5id: 15.4.4.16-2-15
description: Array.prototype.every - 'length' is property of the global object
---*/

        function callbackfn1(val, idx, obj) {
            return val > 10;
        }

        function callbackfn2(val, idx, obj) {
            return val > 11;
        }

            this[0] = 12;
            this[1] = 11;
            this[2] = 9;
            this.length = 2;

assert(Array.prototype.every.call(this, callbackfn1), 'Array.prototype.every.call(this, callbackfn1) !== true');
assert.sameValue(Array.prototype.every.call(this, callbackfn2), false, 'Array.prototype.every.call(this, callbackfn2)');
