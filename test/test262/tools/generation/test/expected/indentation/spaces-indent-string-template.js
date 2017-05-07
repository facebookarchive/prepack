// This file was procedurally generated from the following sources:
// - tools/generation/test/fixtures/indent-string-template.case
// - tools/generation/test/fixtures/indentation/spaces.template
/*---
description: String template spanning multiple lines (Preserving "soft" indentation across newlines)
flags: [generated]
---*/

(function() {
  `this string template is declared across multiple lines

which disqualifies it as a candidate for indentation
it also happens to contain ' and ".`;

  if (true) {
    `this string template is declared across multiple lines

which disqualifies it as a candidate for indentation
it also happens to contain ' and ".`;
  }
}());
