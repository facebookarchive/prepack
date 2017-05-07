// Copyright (C) 2016 the V8 project authors. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.
/*---
esid: sec-function-definitions-runtime-semantics-iteratorbindinginitialization
description: >
    Removal of variable environment for the BindingRestElement formal parameter
info: |
    [...]
    2. Let currentContext be the running execution context.
    3. Let originalEnv be the VariableEnvironment of currentContext.
    4. Assert: The VariableEnvironment and LexicalEnvironment of currentContext
       are the same.
    5. Assert: environment and originalEnv are the same.
    6. Let paramVarEnv be NewDeclarativeEnvironment(originalEnv).
    7. Set the VariableEnvironment of currentContext to paramVarEnv.
    8. Set the LexicalEnvironment of currentContext to paramVarEnv.
    9. Let result be the result of performing IteratorBindingInitialization for
       BindingRestElement using iteratorRecord and environment as the
       arguments.
    10. Set the VariableEnvironment of currentContext to originalEnv.
    11. Set the LexicalEnvironment of currentContext to originalEnv.
    [...]
flags: [noStrict]
---*/

var x = 'outside';
var probeParam, probeBody;

({
  m(
    ...[_ = (eval('var x = "inside";'), probeParam = function() { return x; })]
  ) {
    probeBody = function() { return x; }
  }
}.m());

assert.sameValue(probeParam(), 'inside');
assert.sameValue(probeBody(), 'outside');
