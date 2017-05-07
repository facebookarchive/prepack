// Copyright (C) 2016 the V8 project authors. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.
/*---
esid: sec-template-literals
es6id: 12.2.9
description: Each realm has a distinct template registry
info: |
  TemplateLiteral:NoSubstitutionTemplate

    [...]
    2. Let siteObj be GetTemplateObject(templateLiteral).
    [...]

  TemplateLiteral:TemplateHeadExpressionTemplateSpans

    [...]
    2. Let siteObj be GetTemplateObject(templateLiteral).
    [...]

  Runtime Semantics: GetTemplateObject ( templateLiteral )#


     1. Let rawStrings be TemplateStrings of templateLiteral with argument
        true.
     2. Let realm be the current Realm Record.
     3. Let templateRegistry be realm.[[TemplateMap]].
     4. For each element e of templateRegistry, do
        a, If e.[[Strings]] and rawStrings contain the same values in the same
           order, then
           i. Return e.[[Array]].
---*/

var other = $262.createRealm().global;
var strings1, strings2;

strings1 = (function(strings) { return strings; })`1234`;
strings2 = other.eval('(function(strings) { return strings; })`1234`');

assert.notSameValue(strings1, strings2);
