// This file was procedurally generated from the following sources:
// - src/dstr-binding/obj-ptrn-rest-obj-own-property.case
// - src/dstr-binding/default/try.template
/*---
description: Rest object contains just soruce object's own properties (try statement)
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
var o = Object.create({ x: 1, y: 2 });
o.z = 3;

var ranCatch = false;

try {
  throw o;
} catch ({ x, ...{y , z} }) {
  assert.sameValue(x, 1);
  assert.sameValue(y, undefined);
  assert.sameValue(z, 3);

  ranCatch = true;
}

assert(ranCatch, 'executed `catch` block');
