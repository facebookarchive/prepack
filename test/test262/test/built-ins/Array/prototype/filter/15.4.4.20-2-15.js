// Copyright (c) 2012 Ecma International.  All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.

/*---
es5id: 15.4.4.20-2-15
description: Array.prototype.filter - 'length' is property of the global object
---*/

        function callbackfn(val, idx, obj) {
            return  obj.length === 2;
        }

            this[0] = 12;
            this[1] = 11;
            this[2] = 9;
            this.length = 2;
            var newArr = Array.prototype.filter.call(this, callbackfn);

assert.sameValue(newArr.length, 2, 'newArr.length');
