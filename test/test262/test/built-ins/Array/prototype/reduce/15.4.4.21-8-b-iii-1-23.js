// Copyright (c) 2012 Ecma International.  All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.

/*---
es5id: 15.4.4.21-8-b-iii-1-23
description: >
    Array.prototype.reduce - This object is the global object which
    contains index property
---*/

        var testResult = false;
        function callbackfn(prevVal, curVal, idx, obj) {
            if (idx === 1) {
                testResult = (prevVal === 0);
            }
        }

            this[0] = 0;
            this[1] = 1;
            this[2] = 2;
            this.length = 3;

            Array.prototype.reduce.call(this, callbackfn);

assert(testResult, 'testResult !== true');
