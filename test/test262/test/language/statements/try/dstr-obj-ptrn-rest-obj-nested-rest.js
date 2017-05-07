// This file was procedurally generated from the following sources:
// - src/dstr-binding/obj-ptrn-rest-obj-nested-rest.case
// - src/dstr-binding/default/try.template
/*---
description: When DestructuringAssignmentTarget is an object literal, it should be parsed parsed as a DestructuringAssignmentPattern and evaluated as a destructuring assignment and object rest desconstruction is allowed in that case. (try statement)
esid: sec-runtime-semantics-catchclauseevaluation
es6id: 13.15.7
features: [object-rest, destructuring-binding]
flags: [generated]
includes: [propertyHelper.js]
info: |
    Catch : catch ( CatchParameter ) Block

    [...]
    5. Let status be the result of performing BindingInitialization for
       CatchParameter passing thrownValue and catchEnv as arguments.
    [...]
---*/

var ranCatch = false;

try {
  throw {a: 1, b: 2, c: 3, d: 4, e: 5};
} catch ({a, b, ...{c, ...rest}}) {
  assert.sameValue(a, 1);
  assert.sameValue(b, 2);
  assert.sameValue(c, 3);

  assert.sameValue(rest.d, 4);
  assert.sameValue(rest.e, 5);

  verifyEnumerable(rest, "d");
  verifyWritable(rest, "d");
  verifyConfigurable(rest, "d");

  verifyEnumerable(rest, "e");
  verifyWritable(rest, "e");
  verifyConfigurable(rest, "e");

  ranCatch = true;
}

assert(ranCatch, 'executed `catch` block');
