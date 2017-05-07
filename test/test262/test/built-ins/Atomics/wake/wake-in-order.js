// Copyright (C) 2017 Mozilla Corporation.  All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.

/*---
description: >
  Test that Atomics.wake wakes agents in the order they are waiting.
---*/

// Create workers and start them all spinning.  We set atomic slots to make
// them go into a wait, thus controlling the waiting order.  Then we wake them
// one by one and observe the wakeup order.

for ( var i=0 ; i < 3 ; i++ ) {
$262.agent.start(
`
$262.agent.receiveBroadcast(function (sab) {
  var ia = new Int32Array(sab);
  while (Atomics.load(ia, ${i+1}) == 0);
  $262.agent.report(${i} + Atomics.wait(ia, 0, 0));
  $262.agent.leaving();
})
`);
}

var ia = new Int32Array(new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT*4));
$262.agent.broadcast(ia.buffer);

// Make them sleep in order 0 1 2 on ia[0]
for ( var i=0 ; i < 3 ; i++ ) {
  Atomics.store(ia, i+1, 1);
  $262.agent.sleep(500);
}

// Wake them up one at a time and check the order is 0 1 2
for ( var i=0 ; i < 3 ; i++ ) {
  assert.sameValue(Atomics.wake(ia, 0, 1), 1);
  assert.sameValue(getReport(), i + "ok");
}

function getReport() {
    var r;
    while ((r = $262.agent.getReport()) == null)
        $262.agent.sleep(100);
    return r;
}


