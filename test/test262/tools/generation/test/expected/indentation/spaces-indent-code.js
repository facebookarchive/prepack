// This file was procedurally generated from the following sources:
// - tools/generation/test/fixtures/indent-code.case
// - tools/generation/test/fixtures/indentation/spaces.template
/*---
description: Multiple lines of code (Preserving "soft" indentation across newlines)
flags: [generated]
---*/

(function() {
  'These literals are each contained on a single line...';
  "...which means they may be indented...";
  `...without effecting the semantics of the generated source code.`;

  if (true) {
    'These literals are each contained on a single line...';
    "...which means they may be indented...";
    `...without effecting the semantics of the generated source code.`;
  }
}());
