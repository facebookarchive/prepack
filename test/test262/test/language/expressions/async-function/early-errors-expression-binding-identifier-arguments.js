// Copyright 2016 Microsoft, Inc. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.

/*---
author: Brian Terlson <brian.terlson@microsoft.com>
esid: pending
description: >
  If the source code matching this production is strict code, it is a Syntax Error if BindingIdentifier is the IdentifierName arguments. 
negative:
  phase: early
  type: SyntaxError
flags: [onlyStrict]
---*/
(async function arguments () {  })

