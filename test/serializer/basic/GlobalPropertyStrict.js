"use strict";
global.foo = 42;

global.inspect = function() {
  return global.foo;
};
