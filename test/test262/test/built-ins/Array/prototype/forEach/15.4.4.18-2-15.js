// Copyright (c) 2012 Ecma International.  All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.

/*---
es5id: 15.4.4.18-2-15
description: Array.prototype.forEach - 'length' is property of the global object
---*/

        var result = false;
        function callbackfn(val, idx, obj) {
            result = (obj.length === 2);
        }

            this[0] = 12;
            this[1] = 11;
            this[2] = 9;
            this.length = 2;
            Array.prototype.forEach.call(this, callbackfn);

assert(result, 'result !== true');
