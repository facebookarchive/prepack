// This file was procedurally generated from the following sources:
// - src/spread/mult-err-obj-getter-throws.case
// - src/spread/error/call-expr.template
/*---
description: Object Spread operator results in error when there is an getter that throws an exception (CallExpression)
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

    Pending Runtime Semantics: PropertyDefinitionEvaluation

    PropertyDefinition:...AssignmentExpression

    1. Let exprValue be the result of evaluating AssignmentExpression.
    2. Let fromValue be GetValue(exprValue).
    3. ReturnIfAbrupt(fromValue).
    4. Let excludedNames be a new empty List.
    5. Return CopyDataProperties(object, fromValue, excludedNames).

---*/

assert.throws(Test262Error, function() {
  (function() {}({a: 1, ...{ get foo() { throw new Test262Error(); } }}));
});
