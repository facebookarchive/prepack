// This file was procedurally generated from the following sources:
// - src/spread/sngl-obj-base.case
// - src/spread/default/array.template
/*---
description: Object Spread operator without other arguments (Array initializer)
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

    Pending Runtime Semantics: PropertyDefinitionEvaluation

    PropertyDefinition:...AssignmentExpression

    1. Let exprValue be the result of evaluating AssignmentExpression.
    2. Let fromValue be GetValue(exprValue).
    3. ReturnIfAbrupt(fromValue).
    4. Let excludedNames be a new empty List.
    5. Return CopyDataProperties(object, fromValue, excludedNames).

---*/

var callCount = 0;

(function(obj) {
  assert.sameValue(obj.c, 3);
  assert.sameValue(obj.d, 4);
  assert.sameValue(Object.keys(obj).length, 2);

  verifyEnumerable(obj, "c");
  verifyWritable(obj, "c");
  verifyConfigurable(obj, "c");

  verifyEnumerable(obj, "d");
  verifyWritable(obj, "d");
  verifyConfigurable(obj, "d");
  callCount += 1;
}.apply(null, [{...{c: 3, d: 4}}]));

assert.sameValue(callCount, 1);
