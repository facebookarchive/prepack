// Copyright (C) 2016 the V8 project authors. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.
/*---
description: AnnexB extension not honored in strict mode
es6id: B.3.3.1
flags: [onlyStrict]
info: >
    Block statement in function code containing a function declaration

    B.3.3.1 Changes to FunctionDeclarationInstantiation

    1. If strict is false, then
---*/

var err1, err2;

(function() {
  try {
    f;
  } catch (exception) {
    err1 = exception;
  }

  {
    function f() {  }
  }

  try {
    f;
  } catch (exception) {
    err2 = exception;
  }
}());

assert.sameValue(err1.constructor, ReferenceError);
assert.sameValue(err2.constructor, ReferenceError);
