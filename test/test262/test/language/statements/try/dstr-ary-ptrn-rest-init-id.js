// This file was procedurally generated from the following sources:
// - src/dstr-binding/ary-ptrn-rest-init-id.case
// - src/dstr-binding/default/try.template
/*---
description: Reset element (identifier) does not support initializer (try statement)
esid: sec-runtime-semantics-catchclauseevaluation
es6id: 13.15.7
features: [destructuring-binding]
flags: [generated]
negative:
  phase: early
  type: SyntaxError
info: |
    Catch : catch ( CatchParameter ) Block

    [...]
    5. Let status be the result of performing BindingInitialization for
       CatchParameter passing thrownValue and catchEnv as arguments.
    [...]

    13.3.3 Destructuring Binding Patterns
    ArrayBindingPattern[Yield] :
        [ Elisionopt BindingRestElement[?Yield]opt ]
        [ BindingElementList[?Yield] ]
        [ BindingElementList[?Yield] , Elisionopt BindingRestElement[?Yield]opt ]
---*/

var ranCatch = false;

try {
  throw [];
} catch ([...x = []]) {
  
  ranCatch = true;
}

assert(ranCatch, 'executed `catch` block');
