// Copyright (C) 2016 Jordan Harband. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.

/*---
esid: sec-other-properties-of-the-global-object-global
description: "'global' should be writable, non-enumerable, and configurable"
author: Jordan Harband
includes: [propertyHelper.js]
---*/

verifyNotEnumerable(this, 'global');
verifyWritable(this, 'global');
verifyConfigurable(this, 'global');
