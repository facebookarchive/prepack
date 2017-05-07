// This file was procedurally generated from the following sources:
// - src/dstr-binding/obj-ptrn-rest-obj-own-property.case
// - src/dstr-binding/default/async-gen-func-named-expr.template
/*---
description: Rest object contains just soruce object's own properties (async generator named function expression)
esid: sec-asyncgenerator-definitions-evaluation
features: [object-rest, async-iteration]
flags: [generated, async]
includes: [propertyHelper.js]
info: |
    AsyncGeneratorExpression : async [no LineTerminator here] function * BindingIdentifier
        ( FormalParameters ) { AsyncGeneratorBody }

        [...]
        7. Let closure be ! AsyncGeneratorFunctionCreate(Normal, FormalParameters,
           AsyncGeneratorBody, funcEnv, strict).
        [...]

---*/
var o = Object.create({ x: 1, y: 2 });
o.z = 3;


var callCount = 0;
var f;
f = async function* h({ x, ...{y , z} }) {
  assert.sameValue(x, 1);
  assert.sameValue(y, undefined);
  assert.sameValue(z, 3);

  callCount = callCount + 1;
};

f(o).next().then(() => {
    assert.sameValue(callCount, 1, 'invoked exactly once');
}).then($DONE, $DONE);
