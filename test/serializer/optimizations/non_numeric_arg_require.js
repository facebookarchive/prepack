function f1(arg) {
  return { x: 5 };
}
function f2(arg1, arg2) {
  return { x: 6 };
}

var require = f1;
var x = require("hello");

function f() {
  // none of these should be replaced
  let x = require("hello");
  let y = require(1);
  require = f2;
  let z = require(0, 1);
  return x.x + y.x + z.x;
}

inspect = function() {
  // the require( 0) should be entirely eliminated, but the require(1) will remain
  return f();
};
