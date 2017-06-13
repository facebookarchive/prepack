// recover-from-errors
// expected errors: [{location: {"start":{"line":11,"column":12},"end":{"line":11,"column":13},"identifierName":"y","source":"test/error-handler/BinaryExpression.js"}, errorCode: "PP0002", severity: "Error", message: "might be an object with an unknown valueOf or toString method"}]

var b = global.__abstract ? __abstract("boolean", true) : true;
var x = global.__abstract ? __abstract("number", 123) : 123;
var badOb = { valueOf: function() { throw 13;} }
var ob = global.__abstract ? __abstract("object", "({ valueOf: function() { throw 13;} })") : badOb;
var y = b ? ob : x;

try {
  z = 100 + y;
} catch (err) {
  z = 200 + err;
}

inspect = function() { return "" + z; }
