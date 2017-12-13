let b = global.__abstract ? __abstract("boolean", "true") : true;
function f() {}

function g() {

  if (b) return "foo";
  f();
  return "bar";
}

var x = g();

inspect = function() { return x; }
