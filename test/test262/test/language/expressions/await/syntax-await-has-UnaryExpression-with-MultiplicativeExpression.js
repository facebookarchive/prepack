// Copyright 2016 Microsoft, Inc. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.

/*---
author: Brian Terlson <brian.terlson@microsoft.com>
esid: pending
description: >
  Await's operand is a UnaryExpression
flags: [async]
---*/

async function foo() {
  let x = 2;
  let y = await Promise.resolve(2) * x
  assert.sameValue(y, 4);
}
foo().then($DONE, $DONE);
