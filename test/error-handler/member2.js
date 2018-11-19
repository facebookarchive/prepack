// recover-from-errors
// expected errors: [{"location":{"start":{"line":8,"column":4},"end":{"line":8,"column":6},"identifierName":"oq","source":"test/error-handler/member2.js"},"severity":"FatalError","errorCode":"PP0012"}]

var b = global.__abstract ? __abstract("boolean", "true") : true;
var o = global.__abstract ? __abstract("object", "({})") : {};
var oq = b ? o : null;

x = oq.foo;
