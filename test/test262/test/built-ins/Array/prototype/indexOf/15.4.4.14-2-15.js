// Copyright (c) 2012 Ecma International.  All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.

/*---
es5id: 15.4.4.14-2-15
description: Array.prototype.indexOf - 'length' is property of the global object
---*/

        var targetObj = {};

            this.length = 2;

            this[1] = targetObj;

assert.sameValue(Array.prototype.indexOf.call(this, targetObj), 1, 'Array.prototype.indexOf.call(this, targetObj)');

            this[1] = {};
            this[2] = targetObj;

assert.sameValue(Array.prototype.indexOf.call(this, targetObj), -1, 'Array.prototype.indexOf.call(this, targetObj)');
