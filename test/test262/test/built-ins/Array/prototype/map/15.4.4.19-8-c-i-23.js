// Copyright (c) 2012 Ecma International.  All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.

/*---
es5id: 15.4.4.19-8-c-i-23
description: >
    Array.prototype.map - This object is the global object which
    contains index property
---*/

        var kValue = "abc";

        function callbackfn(val, idx, obj) {
            if (idx === 0) {
                return val === kValue;
            }
            return false;
        }

            this[0] = kValue;
            this.length = 2;

            var testResult = Array.prototype.map.call(this, callbackfn);

assert.sameValue(testResult[0], true, 'testResult[0]');
