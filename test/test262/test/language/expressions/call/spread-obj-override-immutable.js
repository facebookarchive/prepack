// This file was procedurally generated from the following sources:
// - src/spread/obj-override-immutable.case
// - src/spread/default/call-expr.template
/*---
description: Object Spread overriding immutable properties (CallExpression)
esid: sec-function-calls-runtime-semantics-evaluation
es6id: 12.3.4.1
features: [object-spread]
flags: [generated]
includes: [propertyHelper.js]
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

let o = {b: 2};
Object.defineProperty(o, "a", {value: 1, enumerable: true, writable: false, configurable: true});


var callCount = 0;

(function(obj) {
  assert.sameValue(obj.a, 3)
  assert.sameValue(obj.b, 2);

  verifyEnumerable(obj, "a");
  verifyWritable(obj, "a");
  verifyConfigurable(obj, "a");

  verifyEnumerable(obj, "b");
  verifyWritable(obj, "b");
  verifyConfigurable(obj, "b");

  callCount += 1;
}({...o, a: 3}));

assert.sameValue(callCount, 1);
