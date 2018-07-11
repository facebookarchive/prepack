function f() {
  return 123;
}
var g = global.__abstract ? global.__abstract(f, "f") : f;
__result = g();
