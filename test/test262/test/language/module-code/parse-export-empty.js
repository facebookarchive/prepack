// Copyright (C) 2016 the V8 project authors. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.
/*---
description: An ExportClause does not require an ExportsList.
esid: sec-parsemodule
info: |
    ExportDeclaration:
      export * FromClause;
      export ExportClause FromClause;
      export ExportClause;
      export VariableStatement
      export Declaration
      export default HoistableDeclaration[Default]
      export default ClassDeclaration[Default]
      export default [lookahead ∉ { function, class }] AssignmentExpression[In];

    ExportClause:
      { }
      { ExportsList }
      { ExportsList , }

    NOTE: This form has no observable side effects.
flags: [module]
---*/

export{};
export {};
export {}
export { };
export
{

};
export//-
{//-
//-
};
export/**/{/**/};
