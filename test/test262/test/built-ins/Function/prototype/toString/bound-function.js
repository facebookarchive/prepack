// Copyright (C) 2016 Michael Ficarra. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.

/*---
esid: sec-function.prototype.tostring
description: Function.prototype.toString on bound function exotic objects
includes: [nativeFunctionMatcher.js]
---*/

let f = function(){}.bind(null);

assert(NATIVE_FUNCTION_RE.test("" + f), "looks pretty much like a NativeFunction");
