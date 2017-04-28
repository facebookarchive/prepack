// skip

var n = global.__abstract ? __abstract("string", '("x")') : "x";
var m = global.__abstract ? __abstract("string", '("z")') : "z";

a = {x: 123, y: 444};
if (global.__makeSimple) global.__makeSimple(a);
z = a[n];

a[n] = 456;
z1 = a[n];

b = {};
if (global.__makeSimple) global.__makeSimple(b);
z2 = b[m];

b[m] = 789;
z3 = b[m];

inspect = function() { return "" + a.x + a.y + a[n] + z + z1 + z2 + z3; }
