// Copyright (c) 2012 Ecma International.  All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.

/*---
es5id: 15.4.4.15-8-b-i-23
description: Array.prototype.lastIndexOf - This object is the global object
---*/

        var targetObj = {};

            this[0] = targetObj;
            this[100] = "100";
            this[200] = "200";
            this.length = 200;

assert.sameValue(Array.prototype.lastIndexOf.call(this, targetObj), 0, 'Array.prototype.lastIndexOf.call(this, targetObj)');
assert.sameValue(Array.prototype.lastIndexOf.call(this, "100"), 100, 'Array.prototype.lastIndexOf.call(this, "100")');
assert.sameValue(Array.prototype.lastIndexOf.call(this, "200"), -1, 'Array.prototype.lastIndexOf.call(this, "200")');
