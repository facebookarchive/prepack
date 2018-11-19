function f(v) {
  return v * 2;
}
var g = global.__abstract ? global.__abstract("function", "f") : f;
let v = Object.freeze([1]).map(g);

inspect = function() {
  return v;
};
