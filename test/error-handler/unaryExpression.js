// recover-from-errors
// expected errors: [{"location":{"start":{"line":13,"column":10},"end":{"line":13,"column":19},"identifierName":"mysteryOb","source":"test/error-handler/unaryExpression.js"},"severity":"RecoverableError","errorCode":"PP0008"}, {"location":{"start":{"line":15,"column":10},"end":{"line":15,"column":19},"identifierName":"mysteryOb","source":"test/error-handler/unaryExpression.js"},"severity":"RecoverableError","errorCode":"PP0008"}, {"location":{"start":{"line":17,"column":10},"end":{"line":17,"column":19},"identifierName":"mysteryOb","source":"test/error-handler/unaryExpression.js"},"severity":"RecoverableError","errorCode":"PP0008"}]

var b = global.__abstract ? __abstract("boolean", "true") : true;
var x = global.__abstract ? __abstract("number", "123") : 123;
var badOb = {};
if (global.__makeSimple) global.__makeSimple(badOb);
badOb[Symbol.toPrimitive] = function() {
  throw 13;
};
var mysteryOb = b ? null : badOb;

var x1 = +mysteryOb;
var x2 = +x;
var x3 = -mysteryOb;
var x4 = -x;
var x5 = ~mysteryOb;
var x6 = ~x;
var x7 = !b;
var x8 = !x7;
var x9 = !mysteryOb;
var x10 = typeof mysteryOb;
