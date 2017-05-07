// Copyright (c) 2012 Ecma International.  All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.

/*---
es5id: 15.4.4.15-1-17
description: Array.prototype.lastIndexOf applied to the global object
---*/

        var targetObj = ["global"];

            this[1] = targetObj;
            this.length = 3;

assert.sameValue(Array.prototype.lastIndexOf.call(this, targetObj), 1, 'Array.prototype.lastIndexOf.call(this, targetObj)');
