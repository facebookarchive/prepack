// Copyright (C) 2016 the V8 project authors. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.
/*---
esid: sec-function-definitions-runtime-semantics-iteratorbindinginitialization
description: >
    Removal of variable environment for each BindingElement formal parameter
info: |
    [...]
    6. Let paramVarEnv be NewDeclarativeEnvironment(originalEnv).
    7. Set the VariableEnvironment of currentContext to paramVarEnv.
    8. Set the LexicalEnvironment of currentContext to paramVarEnv.
    9. Let result be the result of performing IteratorBindingInitialization for
       BindingElement using iteratorRecord and environment as the arguments.
    10. Set the VariableEnvironment of currentContext to originalEnv.
    11. Set the LexicalEnvironment of currentContext to originalEnv.
    [...]
flags: [noStrict]
---*/

var x = 'outside';
var probe1, probe2, probeBody;

function f(
    _ = (eval('var x = "inside";'), probe1 = function() { return x; }),
    __ = probe2 = function() { return x; }
  ) {
  probeBody = function() { return x; };
}
f();

assert.sameValue(probe1(), 'inside');
assert.sameValue(probe2(), 'outside');
assert.sameValue(probeBody(), 'outside');
