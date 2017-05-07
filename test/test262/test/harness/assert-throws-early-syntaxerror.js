// Copyright (C) 2017 Mozilla Corporation. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.

/*---
description: >
    The assertion pass when the code parses with an early SyntaxError
---*/

assert.throws.early(SyntaxError, 'let let');
