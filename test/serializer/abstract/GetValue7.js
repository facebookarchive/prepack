// throws introspection error

var n = global.__abstract ? __abstract("string", '("x")') : "x";
var m = global.__abstract ? __abstract("string", '("x")') : "x";
a = {x: 123, y: 444};
if (global.__makeSimple) global.__makeSimple(a);
a[n] = 456;

z = a[n];

inspect = function() { return z; }
