// recover-from-errors
// expected errors: [{"location":{"start":{"line":14,"column":0},"end":{"line":14,"column":1},"identifierName":"y","source":"test/error-handler/updateExpression.js"},"severity":"RecoverableError","errorCode":"PP0008"}, {"location":{"start":{"line":15,"column":2},"end":{"line":15,"column":4},"identifierName":"ob","source":"test/error-handler/updateExpression.js"},"severity":"RecoverableError","errorCode":"PP0008"}]

var b = global.__abstract ? __abstract("boolean", "true") : true;
var x = global.__abstract ? __abstract("number", "123") : 123;
var badOb = {
  valueOf: function() {
    throw 13;
  },
};
var ob = global.__abstract ? __abstract("object", "({ valueOf: function() { throw 13;} })") : badOb;
var y = b ? ob : x;

y++;
--ob;
