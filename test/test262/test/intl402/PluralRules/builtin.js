// Copyright 2016 Mozilla Corporation. All rights reserved.
// This code is governed by the license found in the LICENSE file.

/*---
esid: sec-Intl.PluralRules
description: >
    Tests that Intl.PluralRules meets the requirements for
    built-in objects defined by the introduction of chapter 17 of the
    ECMAScript Language Specification.
author: Zibi Braniecki
includes: [testBuiltInObject.js]
---*/

testBuiltInObject(Intl.PluralRules, true, true, ["supportedLocalesOf"], 0);
