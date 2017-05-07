// This file was procedurally generated from the following sources:
// - tools/generation/test/fixtures/normal.case
// - tools/generation/test/fixtures/normal/normal.template
/*---
description: foobar (First template name)
es6id: 1.2.3
flags: [generated, a, b, c, d]
includes: [foo.js]
info: |
    template info

    case info
---*/

before-First value-between-Third value-after

before*Second value*between*First value*after

before/* " */Third valueafter

The following should not be expanded:

/* */*{ first }*/
/*
*/*{ first }*/
//*{ first }*/
// /*{ first }*/
Quote characters: " ' `
"Quote characters: ' ' `"
'Quote characters: " " `'
`
Quote characters: " ' '`

'This is "teardown" code.';
