var n = global.__abstract ? __abstract("string", '/* n = */ ("x")') : "x";
var m = global.__abstract ? __abstract("string", '/* m = */ ("x")') : "x";
var c = global.__abstract ? __abstract("boolean", "/* c = */ true") : true;

a = { x: 123, y: 444 };
if (global.__makeSimple) global.__makeSimple(a);
a[n] = 456;

var b = { xx: 123 };
if (global.__makeSimple) global.__makeSimple(b);
b[n] = 456;
b[m] = 789;
b[n] = 999;
if (c) {
  b[n] = 888;
} else {
  b[n] = 777;
}

var z = a.x;
var z1 = b.xx;
var z2 = b.x;

inspect = function() {
  return "" + z + z1 + z2 + b["x"];
};
