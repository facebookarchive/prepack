// Copyright (C) 2016 the V8 project authors. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.
/*---
esid: sec-runtime-semantics-classdefinitionevaluation
es6id: 14.5.14
description: >
  Observable iteration of arguments during execution of "inferred" constructor
info: |
  [...]
  10. If constructor is empty, then
      a. If ClassHeritageopt is present and superclass is not null, then
         i. Let constructor be the result of parsing the source text

             constructor(... args){ super (...args);}

         using the syntactic grammar with the goal symbol MethodDefinition[~Yield].
features: [Symbol.iterator]
---*/

var otherIterator = ['fifth', 'sixth', 'seventh'][Symbol.iterator]();
var spread, parentArgs;
function Parent() {
  parentArgs = arguments;
}
class C extends Parent {}

Array.prototype[Symbol.iterator] = function() {
  spread = this;
  return otherIterator;
};

new C('first', 'second', 'third', 'fourth');

assert.sameValue(Object.getPrototypeOf(spread), Array.prototype);
assert.sameValue(spread.length, 4);
assert.sameValue(spread[0], 'first');
assert.sameValue(spread[1], 'second');
assert.sameValue(spread[2], 'third');
assert.sameValue(spread[3], 'fourth');

assert.sameValue(
  typeof parentArgs, 'object', 'parent arguments object'
);
assert.sameValue(parentArgs.length, 3);
assert.sameValue(parentArgs[0], 'fifth');
assert.sameValue(parentArgs[1], 'sixth');
assert.sameValue(parentArgs[2], 'seventh');
