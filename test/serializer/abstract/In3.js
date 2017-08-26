// throws introspection error

var b = global.__abstract ? __abstract("boolean", true) : true;
var a1 = global.__makePartial ? __makePartial({}) : {};
if (global.__makeSimple) global.__makeSimple(a1);
var a2 = global.__abstract ? __abstract("object", "([])"): [];

x1 = "4" in a1;
x2 = "4" in a2;
