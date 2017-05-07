// Copyright (C) 2017 Mozilla Corporation.  All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.

/*---
description: >
  Test that Atomics.wait returns the right result when it was awoken.
---*/

$262.agent.start(
`
$262.agent.receiveBroadcast(function (sab, id) {
  var ia = new Int32Array(sab);
  $262.agent.report(Atomics.wait(ia, 0, 0)); // No timeout => Infinity
  $262.agent.leaving();
})
`);

var ia = new Int32Array(new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT));

$262.agent.broadcast(ia.buffer);
$262.agent.sleep(500);                // Give the agent a chance to wait
Atomics.wake(ia, 0);
assert.sameValue(getReport(), "ok");

function getReport() {
    var r;
    while ((r = $262.agent.getReport()) == null)
        $262.agent.sleep(100);
    return r;
}

