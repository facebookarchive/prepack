// Copyright (c) 2012 Ecma International.  All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.

/*---
es5id: 15.4.4.14-1-17
description: Array.prototype.indexOf applied to the global object
---*/

            this[1] = true;
            this.length = 2;

assert.sameValue(Array.prototype.indexOf.call(this, true), 1, 'Array.prototype.indexOf.call(this, true)');
