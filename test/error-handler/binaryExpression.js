// recover-from-errors
// expected errors: [{location: {"start":{"line":15,"column":12},"end":{"line":15,"column":13},"identifierName":"y","source":"test/error-handler/binaryExpression.js"}, errorCode: "PP0002", severity: "RecoverableError", message: "might be an object with an unknown valueOf or toString or Symbol.toPrimitive method"},{location: {"start":{"line":16,"column":6},"end":{"line":16,"column":7},"identifierName":"y","source":"test/error-handler/binaryExpression.js"}, errorCode: "PP0002", severity: "RecoverableError", message: "might be an object with an unknown valueOf or toString or Symbol.toPrimitive method"}, {"location":{"start":{"line":21,"column":5},"end":{"line":21,"column":6},"identifierName":"y","source":"test/error-handler/binaryExpression.js"},"severity":"RecoverableError","errorCode":"PP0002"}, {"location":{"start":{"line":21,"column":55},"end":{"line":21,"column":56},"identifierName":"y","source":"test/error-handler/binaryExpression.js"},"severity":"RecoverableError","errorCode":"PP0002"}]

var b = global.__abstract ? __abstract("boolean", "true") : true;
var x = global.__abstract ? __abstract("number", "123") : 123;
var badOb = {
  valueOf: function() {
    throw 13;
  },
};
var ob = global.__makePartial ? __makePartial({}) : badOb;
var y = b ? ob : x;

try {
  z = 100 + y;
  z = y + 200;
} catch (err) {
  z = 300 + err;
}

z1 = y < 13 && x > 122 && 123 <= x && x >= 123 && x == y && x != 1 && x === x && x !== y;

inspect = function() {
  return "" + z + z1;
};
