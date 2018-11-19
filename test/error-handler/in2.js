// recover-from-errors
// expected errors: [{"location":{"start":{"line":13,"column":12},"end":{"line":13,"column":14},"identifierName":"a2","source":"test/error-handler/in2.js"},"severity":"RecoverableError","errorCode":"PP0004"}]

var b = global.__abstract ? __abstract("boolean", "true") : true;
var a0 = { "4": 5 };
var a1 = global.__makeSimple ? __makeSimple({ "4": 5 }) : a0;

var tArr = new Int8Array(4);
var a2 = global.__abstract ? __abstract("object", "tArr") : tArr;

x0 = "4" in a0;
x1 = "4" in a1;
x2 = "4" in a2;

inspect = function() {
  return "" + x0 + x1 + x2;
};
