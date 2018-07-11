// delay unsupported requires

let x = global.__abstract ? __abstract("boolean", "true") : true;

function __d(factory, moduleId) {}

function foo() {
  let r = { xyz: 123 };
  if (!x) throw "something bad";
  return r;
}

function require(i) {
  try {
    return foo();
  } catch (e) {
    throw e;
  }
}

__d(foo, 0);

var z = require(0);

inspect = function() {
  return z;
};
