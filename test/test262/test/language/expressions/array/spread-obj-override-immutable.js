// This file was procedurally generated from the following sources:
// - src/spread/obj-override-immutable.case
// - src/spread/default/array.template
/*---
description: Object Spread overriding immutable properties (Array initializer)
esid: sec-runtime-semantics-arrayaccumulation
es6id: 12.2.5.2
features: [object-spread]
flags: [generated]
includes: [propertyHelper.js]
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
}.apply(null, [{...o, a: 3}]));

assert.sameValue(callCount, 1);
