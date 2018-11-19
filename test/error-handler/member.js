// recover-from-errors
// expected errors: [{"location":{"start":{"line":8,"column":0},"end":{"line":8,"column":2},"identifierName":"oq","source":"test/error-handler/member.js"},"severity":"FatalError","errorCode":"PP0012"}]

var b = global.__abstract ? __abstract("boolean", "true") : true;
var o = global.__abstract ? __abstract("object", "({})") : {};
var oq = b ? o : null;

oq.foo = 123;
