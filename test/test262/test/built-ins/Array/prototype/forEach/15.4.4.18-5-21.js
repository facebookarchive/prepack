// Copyright (c) 2012 Ecma International.  All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.

/*---
es5id: 15.4.4.18-5-21
description: Array.prototype.forEach - the global object can be used as thisArg
---*/

var global = this;
        var result = false;
        function callbackfn(val, idx, obj) {
            result = (this === global);
        }

        [11].forEach(callbackfn, this);

assert(result, 'result !== true');
