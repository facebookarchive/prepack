function f() { return 123; }
var g = global.__abstract ? __abstract("function", "f") : f;
z = g && g();

inspect = function() { return "" + z }
