function f() {
  return 123;
}
var g = global.__abstract ? global.__abstract("function", "f") : f;
var z = g();

inspect = function() {
  return "" + z;
};
