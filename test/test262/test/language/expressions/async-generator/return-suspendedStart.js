// Copyright 2017 the V8 project authors. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.

/*---
author: Caitlin Potter <caitp@igalia.com>
esid: pending
description: >
  Generator is not resumed after a return type completion.
  Returning non-promise before start
info: |
  AsyncGeneratorResumeNext:
  If completion.[[Type]] is return, and generator.[[AsyncGeneratorState]] is
  "suspendedStart", generator is closed without being resumed.
flags: [async]
features: [async-iteration]
---*/

var g = async function*() {
  throw new Test262Error('Generator must not be resumed.');
};

var it = g();
it.return('sent-value').then(function(ret) {
  assert.sameValue(ret.value, 'sent-value', 'AsyncGeneratorResolve(generator, completion.[[Value]], true)');
  assert.sameValue(ret.done, true, 'AsyncGeneratorResolve(generator, completion.[[Value]], true)');

  it.next().then(function(ret) {
    assert.sameValue(ret.value, undefined, 'Generator is closed');
    assert.sameValue(ret.done, true, 'Generator is closed');
  }).then($DONE, $DONE);
}).catch($DONE);
