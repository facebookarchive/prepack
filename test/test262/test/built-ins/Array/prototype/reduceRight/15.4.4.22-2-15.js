// Copyright (c) 2012 Ecma International.  All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.

/*---
es5id: 15.4.4.22-2-15
description: >
    Array.prototype.reduceRight - 'length' is property of the global
    object
---*/

var global = this;
        var accessed = false;

        function callbackfn(prevVal, curVal, idx, obj) {
            accessed = true;
            return obj.length === global.length;
        }

            this[0] = 12;
            this[1] = 11;
            this[2] = 9;
            this.length = 2;

assert(Array.prototype.reduceRight.call(this, callbackfn, 111), 'Array.prototype.reduceRight.call(this, callbackfn, 111) !== true');
assert(accessed, 'accessed !== true');
