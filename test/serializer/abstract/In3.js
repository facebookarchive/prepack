// throws introspection error

var b = global.__abstract ? __abstract("boolean", "true") : true;
var a0 = { "4": 5 };
var a1 = global.__abstract ? __abstract(a0, "({ '4': 5 })") : a0;
if (global.__makeSimple) global.__makeSimple(a1);
var tArr = new Int8Array(4);
var a2 = global.__abstract ? __abstract(tArr, "tArr") : tArr;

x0 = "4" in a0;
x1 = "4" in a1;
x2 = "4" in a2;

inspect = function() {
  return "" + x0 + x1 + x2;
};
