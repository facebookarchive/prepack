function f() { return 123; }
var g = global.__abstract ? __optional(__abstract("function", "f")) : f;
if (g !== undefined)
  z = g();

inspect = function() { return "" + z }
