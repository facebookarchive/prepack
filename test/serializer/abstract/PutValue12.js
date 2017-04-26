var n = global.__abstract ? __abstract("string", '("x")') : "x";
var m = global.__abstract ? __abstract("string", '("x")') : "x";
var c = global.__abstract ? __abstract("boolean", "true") : true;

a = {x: 123, y: 444};
if (global.__makeSimple) global.__makeSimple(a);
a[n] = 456;

b = {xx: 123};
if (global.__makeSimple) global.__makeSimple(b);
b[n] = 456;
b[m] = 789;
b[n] = 999;
if (c) {
  b[n] = 888;
} else {
  b[n] = 777;
}

z = a.x;
z1 = b.xx;
z2 = b.x;

inspect = function() { return '' + z + z1 + z2 + b["x"]; }
