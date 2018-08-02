var x = 42;
var y = global.__abstract ? global.__abstract("number", x.toString()) : x;
var s = typeof y;

let f = y ? () => 1 : () => 2;
var t = typeof f;

let yy = y * y;
var u = typeof yy;

let b = y > 3;
var v = typeof b;

inspect = function() {
  return s + t + u + v;
};
