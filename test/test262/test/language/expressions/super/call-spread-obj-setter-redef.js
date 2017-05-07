// This file was procedurally generated from the following sources:
// - src/spread/obj-setter-redef.case
// - src/spread/default/super-call.template
/*---
description: Setter are not executed when redefined in Object Spread (SuperCall)
esid: sec-super-keyword-runtime-semantics-evaluation
es6id: 12.3.5.1
features: [object-spread]
flags: [generated]
info: |
    SuperCall : super Arguments

    1. Let newTarget be GetNewTarget().
    2. If newTarget is undefined, throw a ReferenceError exception.
    3. Let func be GetSuperConstructor().
    4. ReturnIfAbrupt(func).
    5. Let argList be ArgumentListEvaluation of Arguments.
    [...]
---*/
let executedSetter = false;


var callCount = 0;

class Test262ParentClass {
  constructor(obj) {
    assert.sameValue(obj.c, 1);
    assert.sameValue(executedSetter, false);
    assert.sameValue(Object.keys(obj).length, 1);
    callCount += 1;
  }
}

class Test262ChildClass extends Test262ParentClass {
  constructor() {
    super({set c(v) { executedSetter = true; }, ...{c: 1}});
  }
}

new Test262ChildClass();
assert.sameValue(callCount, 1);
