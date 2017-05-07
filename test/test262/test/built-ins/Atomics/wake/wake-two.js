// Copyright (C) 2017 Mozilla Corporation.  All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.

/*---
description: >
  Test that Atomics.wake wakes two waiters if that's what the count is.
---*/

for ( var i=0 ; i < 3 ; i++ ) {
$262.agent.start(
`
$262.agent.receiveBroadcast(function (sab) {
  var ia = new Int32Array(sab);
  $262.agent.report(Atomics.wait(ia, 0, 0, 1000)); // We may timeout eventually
  $262.agent.leaving();
})
`);
}

var ia = new Int32Array(new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT));

$262.agent.broadcast(ia.buffer);
$262.agent.sleep(500);                             // Give the agents a chance to wait
assert.sameValue(Atomics.wake(ia, 0, 2), 2);    // Wake two
var rs = [getReport(), getReport(), getReport()];
rs.sort();
assert.sameValue(rs[0], "ok");
assert.sameValue(rs[1], "ok");
assert.sameValue(rs[2], "timed-out");

function getReport() {
    var r;
    while ((r = $262.agent.getReport()) == null)
        $262.agent.sleep(100);
    return r;
}
