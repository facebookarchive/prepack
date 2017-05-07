// This file was procedurally generated from the following sources:
// - src/dstr-binding/obj-ptrn-rest-nested-obj.case
// - src/dstr-binding/default/try.template
/*---
description: When DestructuringAssignmentTarget is an object literal, it should be parsed parsed as a DestructuringAssignmentPattern and evaluated as a destructuring assignment. (try statement)
esid: sec-runtime-semantics-catchclauseevaluation
es6id: 13.15.7
features: [object-rest, destructuring-binding]
flags: [generated]
info: |
    Catch : catch ( CatchParameter ) Block

    [...]
    5. Let status be the result of performing BindingInitialization for
       CatchParameter passing thrownValue and catchEnv as arguments.
    [...]
---*/
var obj = {a: 3, b: 4};

var ranCatch = false;

try {
  throw {a: 1, b: 2, c: 3, d: 4, e: 5};
} catch ({a, b, ...{c, e}}) {
  assert.sameValue(a, 1);
  assert.sameValue(b, 2);
  assert.sameValue(c, 3);
  assert.sameValue(e, 5);

  ranCatch = true;
}

assert(ranCatch, 'executed `catch` block');
