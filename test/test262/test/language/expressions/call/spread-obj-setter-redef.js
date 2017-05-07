// This file was procedurally generated from the following sources:
// - src/spread/obj-setter-redef.case
// - src/spread/default/call-expr.template
/*---
description: Setter are not executed when redefined in Object Spread (CallExpression)
esid: sec-function-calls-runtime-semantics-evaluation
es6id: 12.3.4.1
features: [object-spread]
flags: [generated]
info: |
    CallExpression : MemberExpression Arguments

    [...]
    9. Return EvaluateDirectCall(func, thisValue, Arguments, tailCall).

    12.3.4.3 Runtime Semantics: EvaluateDirectCall

    1. Let argList be ArgumentListEvaluation(arguments).
    [...]
    6. Let result be Call(func, thisValue, argList).
    [...]
---*/
let executedSetter = false;


var callCount = 0;

(function(obj) {
  assert.sameValue(obj.c, 1);
  assert.sameValue(executedSetter, false);
  assert.sameValue(Object.keys(obj).length, 1);
  callCount += 1;
}({set c(v) { executedSetter = true; }, ...{c: 1}}));

assert.sameValue(callCount, 1);
