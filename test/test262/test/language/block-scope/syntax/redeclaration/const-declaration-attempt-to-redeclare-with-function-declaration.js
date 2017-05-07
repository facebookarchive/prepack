// This file was procedurally generated from the following sources:
// - src/declarations/redeclare-with-function-declaration.case
// - src/declarations/redeclare-allow-sloppy-function/block-attempt-to-redeclare-const-declaration.template
/*---
description: redeclaration with FunctionDeclaration (LexicalDeclaration (const) in BlockStatement)
esid: sec-block-static-semantics-early-errors
flags: [generated]
negative:
  phase: early
  type: SyntaxError
info: |
    Block : { StatementList }

    It is a Syntax Error if the LexicallyDeclaredNames of StatementList contains
    any duplicate entries.

---*/


{ const f = 0; function f() {} }
