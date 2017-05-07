// This file was procedurally generated from the following sources:
// - src/dstr-binding/obj-ptrn-rest-obj-own-property.case
// - src/dstr-binding/default/async-gen-method-dflt.template
/*---
description: Rest object contains just soruce object's own properties (async generator method (default parameter))
esid: sec-asyncgenerator-definitions-propertydefinitionevaluation
features: [object-rest, async-iteration]
flags: [generated, async]
includes: [propertyHelper.js]
info: |
    AsyncGeneratorMethod :
        async [no LineTerminator here] * PropertyName ( UniqueFormalParameters )
            { AsyncGeneratorBody }

    1. Let propKey be the result of evaluating PropertyName.
    2. ReturnIfAbrupt(propKey).
    3. If the function code for this AsyncGeneratorMethod is strict mode code, let strict be true.
       Otherwise let strict be false.
    4. Let scope be the running execution context's LexicalEnvironment.
    5. Let closure be ! AsyncGeneratorFunctionCreate(Method, UniqueFormalParameters,
       AsyncGeneratorBody, scope, strict).
    [...]

---*/
var o = Object.create({ x: 1, y: 2 });
o.z = 3;


var callCount = 0;
var obj = {
  async *method({ x, ...{y , z} } = o) {
    assert.sameValue(x, 1);
    assert.sameValue(y, undefined);
    assert.sameValue(z, 3);

    callCount = callCount + 1;
  }
};

obj.method().next().then(() => {
    assert.sameValue(callCount, 1, 'invoked exactly once');
}).then($DONE, $DONE);
