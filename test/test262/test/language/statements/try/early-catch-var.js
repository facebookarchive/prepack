// Copyright (C) 2016 the V8 project authors. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.
/*---
esid: sec-try-statement-static-semantics-early-errors
es6id: 13.15.1
description: >
    It is a Syntax Error if any element of the BoundNames of CatchParameter
    also occurs in the VarDeclaredNames of Block.
info: >
    Annex B extensions permit re-declarations from VariableStatement, the
    VariableDeclarationList of a for statement, and the ForBinding of a for-of
    statement. Bindings from the ForBinding of a for-in statement are
    restricted regardless of the application of Annex B.
negative:
  phase: early
  type: SyntaxError
---*/

$ERROR('This code should not be executed.');

try { } catch (x) { for (var x of []) {} }
