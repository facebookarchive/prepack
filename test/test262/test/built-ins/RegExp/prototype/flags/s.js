// Copyright (C) 2017 the V8 project authors. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.

/*---
description: >
    's' entry's presence is determined by `s` flag
esid: sec-get-regexp.prototype.flags
info: >
    21.2.5.3 get RegExp.prototype.flags

    10. Let dotAll be ToBoolean(? Get(R, "dotAll")).
    11. If dotAll is true, append "s" as the last code unit of result.
features: [regexp-dotall]
---*/

var flags;

flags = /./s.flags;
assert.sameValue(flags, 's');

let re = /./;
Object.defineProperty(re, 'dotAll', {value: true});
assert.sameValue(re.flags, 's');
