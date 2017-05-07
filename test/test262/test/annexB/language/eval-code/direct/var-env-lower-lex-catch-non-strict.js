// Copyright (C) 2016 the V8 project authors. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.
/*---
esid: sec-variablestatements-in-catch-blocks
es6id: B3.5
description: Re-declaration of catch parameter
info: >
    [...]

    This modified behaviour also applies to var and function declarations
    introduced by direct evals contained within the Block of a Catch clause.
    This change is accomplished by modify the algorithm of 18.2.1.2 as follows:

    Step 5.d.ii.2.a.i is replaced by:

    i. If thisEnvRec is not the Environment Record for a Catch clause, throw a
       SyntaxError exception.
    ii. If name is bound by any syntactic form other than a
        FunctionDeclaration, a VariableStatement, the VariableDeclarationList
        of a for statement, or the ForBinding of a for-in statement, throw a
        SyntaxError exception.
flags: [noStrict]
---*/

try {
  throw null;
} catch (err) {
  eval('function err() {}');
  eval('var err;');
  eval('for (var err; false; ) {}');
  eval('for (var err in []) {}');
}
