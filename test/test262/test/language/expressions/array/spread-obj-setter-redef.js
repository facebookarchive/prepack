// This file was procedurally generated from the following sources:
// - src/spread/obj-setter-redef.case
// - src/spread/default/array.template
/*---
description: Setter are not executed when redefined in Object Spread (Array initializer)
esid: sec-runtime-semantics-arrayaccumulation
es6id: 12.2.5.2
features: [object-spread]
flags: [generated]
info: |
    SpreadElement : ...AssignmentExpression

    1. Let spreadRef be the result of evaluating AssignmentExpression.
    2. Let spreadObj be ? GetValue(spreadRef).
    3. Let iterator be ? GetIterator(spreadObj).
    4. Repeat
       a. Let next be ? IteratorStep(iterator).
       b. If next is false, return nextIndex.
       c. Let nextValue be ? IteratorValue(next).
       d. Let status be CreateDataProperty(array, ToString(ToUint32(nextIndex)),
          nextValue).
       e. Assert: status is true.
       f. Let nextIndex be nextIndex + 1.
---*/
let executedSetter = false;


var callCount = 0;

(function(obj) {
  assert.sameValue(obj.c, 1);
  assert.sameValue(executedSetter, false);
  assert.sameValue(Object.keys(obj).length, 1);
  callCount += 1;
}.apply(null, [{set c(v) { executedSetter = true; }, ...{c: 1}}]));

assert.sameValue(callCount, 1);
