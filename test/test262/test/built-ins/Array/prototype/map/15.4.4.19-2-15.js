// Copyright (c) 2012 Ecma International.  All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.

/*---
es5id: 15.4.4.19-2-15
description: >
    Array.prototype.map - when 'length' is property of the global
    object
---*/

        function callbackfn(val, idx, obj) {
            return val > 10;
        }

            this[0] = 12;
            this[1] = 11;
            this[2] = 9;
            this.length = 2;
            var testResult = Array.prototype.map.call(this, callbackfn);

assert.sameValue(testResult.length, 2, 'testResult.length');
