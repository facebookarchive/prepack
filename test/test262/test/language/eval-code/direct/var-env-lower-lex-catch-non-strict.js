// Copyright (C) 2016 the V8 project authors. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.
/*---
esid: sec-evaldeclarationinstantiation
es6id: 18.2.1.2
description: Variable collision with lexical binding in lower scope
info: >
    Annex B extensions permit re-declarations from FunctionDeclaration,
    VariableStatement, the VariableDeclarationList of a for statement, and the
    ForBinding of a for-in statement. Bindings from the ForBinding of a for-of
    statement are restricted regardless of the application of Annex B.
flags: [noStrict]
---*/

assert.throws(SyntaxError, function() {
  try {
    throw null;
  } catch (err) {
    eval('for (var err of []) {}');
  }
});
