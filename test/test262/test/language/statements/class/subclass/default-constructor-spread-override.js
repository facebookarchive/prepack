// Copyright (C) 2016 André Bargull. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.

/*---
esid: sec-runtime-semantics-classdefinitionevaluation
description: >
  Default class constructor uses standard iterator spread semantics.
info: >
  14.5.14 Runtime Semantics: ClassDefinitionEvaluation
    ...
    10. If constructor is empty, then
      a. If ClassHeritageopt is present, then
          i Let constructor be the result of parsing the source text
              constructor(...args){ super(...args); }
            using the syntactic grammar with the goal symbol MethodDefinition.
    ...

  14.1.19 Runtime Semantics: IteratorBindingInitialization
    `FunctionRestParameter : BindingRestElement`
    ...
    9. Let result be the result of performing IteratorBindingInitialization for BindingRestElement using iteratorRecord and environment as the arguments.
    ...

  13.3.3.6 Runtime Semantics: IteratorBindingInitialization
    `BindingRestElement : ...BindingIdentifier`
    ...
    2. Let A be ArrayCreate(0).
    ...

  12.3.6.1 Runtime Semantics: ArgumentListEvaluation
    `ArgumentList : ArgumentList , ...AssignmentExpression`
    ...
    3. Let iterator be ? GetIterator(? GetValue(spreadRef)).
    ...
features: [Symbol.iterator]
---*/

var arrayIterator = Array.prototype[Symbol.iterator];

// Redefine Array iterator to change the result of spreading `args` in `super(...args)`.
Array.prototype[Symbol.iterator] = function() {
  return arrayIterator.call(["spread-value"]);
};

var receivedValue;

class Base {
  constructor(value) {
    receivedValue = value;
  }
}

class Derived extends Base {}

new Derived();

assert.sameValue(receivedValue, "spread-value");
