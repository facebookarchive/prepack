// Copyright 2016 Microsoft, Inc. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.

/*---
author: Brian Terlson <brian.terlson@microsoft.com>
esid: pending
description: >
  Await throws errors from rejected promises
---*/

async function foo() {
  var err = {};
  var caught = false;
  try {
    await Promise.reject(err);
  } catch(e) {
    caught = true;
    assert.sameValue(e, err);
  }

  assert(caught);
}

