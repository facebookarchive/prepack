// This file was procedurally generated from the following sources:
// - tools/generation/test/fixtures/indent-string-continuation.case
// - tools/generation/test/fixtures/indentation/spaces.template
/*---
description: Multiline string via a line continuation character (Preserving "soft" indentation across newlines)
flags: [generated]
---*/

(function() {
  'this string is declared across multiple lines\
\
which disqualifies it as a candidate for indentation';

  if (true) {
    'this string is declared across multiple lines\
\
which disqualifies it as a candidate for indentation';
  }
}());
