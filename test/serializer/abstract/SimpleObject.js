let o = global.__abstract ? __makeSimple(__abstract("object", "({})")) : {};
let p = global.__abstract ? __makeSimple(__abstract("object", "({ toString: () => 'x' })")) : { toString: () => "x" };
o[p] = p;
var x = Array.isArray(o);
var y = typeof o[p];

inspect = function() {
  return x + " " + y;
};
