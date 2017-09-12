// throws introspection error

function f() { return 123; }
var g = global.__abstract ? __optional(__abstract("function", "f")) : f;
z = g();

inspect = function() { return "" + z }
