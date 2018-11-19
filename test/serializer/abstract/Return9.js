let b = global.__abstract ? __abstract("boolean", "true") : true;
function f() {}

let y = 1;
function g() {
  if (b) return "foo";
  y = 2;
  f();
  return "bar";
}

var x = g();

inspect = function() {
  return [x, y].join(" ");
};
