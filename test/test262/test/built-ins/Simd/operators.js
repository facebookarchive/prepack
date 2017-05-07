// Copyright (C) 2016 ecmascript_simd authors. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.

/*---
esid: pending
description: Test SIMD operators.
includes: [simdUtilities.js]
---*/

function testOperators(type) {
  var inst = createTestValue(type);
  assert.throws(TypeError, function() { Number(inst) });
  assert.throws(TypeError, function() { +inst });
  assert.throws(TypeError, function() { -inst });
  assert.throws(TypeError, function() { ~inst });
  assert.throws(TypeError, function() { Math.fround(inst) });
  assert.throws(TypeError, function() { inst|0} );
  assert.throws(TypeError, function() { inst&0 });
  assert.throws(TypeError, function() { inst^0 });
  assert.throws(TypeError, function() { inst>>>0 });
  assert.throws(TypeError, function() { inst>>0 });
  assert.throws(TypeError, function() { inst<<0 });
  assert.throws(TypeError, function() { (inst + inst) });
  assert.throws(TypeError, function() { inst - inst });
  assert.throws(TypeError, function() { inst * inst });
  assert.throws(TypeError, function() { inst / inst });
  assert.throws(TypeError, function() { inst % inst });
  assert.throws(TypeError, function() { inst < inst });
  assert.throws(TypeError, function() { inst > inst });
  assert.throws(TypeError, function() { inst <= inst });
  assert.throws(TypeError, function() { inst >= inst });
  assert.throws(TypeError, function() { inst(); });

  assert.sameValue(inst[0], undefined);
  assert.sameValue(inst.a, undefined);
  assert.sameValue(!inst, false);
  assert.sameValue(!inst, false);
  assert.sameValue(inst ? 1 : 2, 1);
  assert.sameValue(inst ? 1 : 2, 1);

  assert.sameValue('function', typeof inst.toString);
  assert.sameValue('function', typeof inst.toLocaleString);
  assert.sameValue(inst.toLocaleString(), simdToLocaleString(type, inst));

  var eval_value = eval(inst.toString());
  var value = type.fn.check(inst);
  for(var i = 0; i < type.lanes; i++) {
    assert.sameValue(type.fn.extractLane(eval_value, i),
        type.fn.extractLane(value, i));
  }
  // TODO: test valueOf?
}

simdTypes.forEach(function(type) {
  testSimdFunction(type.name + ' operators', function() {
    testOperators(type);
  });
});
