// This file was procedurally generated from the following sources:
// - src/spread/obj-setter-redef.case
// - src/spread/default/member-expr.template
/*---
description: Setter are not executed when redefined in Object Spread (`new` operator)
esid: sec-new-operator-runtime-semantics-evaluation
es6id: 12.3.3.1
features: [object-spread]
flags: [generated]
info: |
    MemberExpression : new MemberExpression Arguments

    1. Return EvaluateNew(MemberExpression, Arguments).

    12.3.3.1.1 Runtime Semantics: EvaluateNew

    6. If arguments is empty, let argList be an empty List.
    7. Else,
       a. Let argList be ArgumentListEvaluation of arguments.
       [...]
---*/
let executedSetter = false;


var callCount = 0;

new function(obj) {
  assert.sameValue(obj.c, 1);
  assert.sameValue(executedSetter, false);
  assert.sameValue(Object.keys(obj).length, 1);
  callCount += 1;
}({set c(v) { executedSetter = true; }, ...{c: 1}});

assert.sameValue(callCount, 1);
