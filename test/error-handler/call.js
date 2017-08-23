// recover-from-errors
// expected errors: [{"location":{"start":{"line":10,"column":0},"end":{"line":10,"column":1},"identifierName":"o","source":"test/error-handler/call.js"},"severity":"RecoverableError","errorCode":"PP0005"}, {"location":{"start":{"line":11,"column":2},"end":{"line":11,"column":3},"identifierName":"m","source":"test/error-handler/call.js"},"severity":"RecoverableError","errorCode":"PP0005"}, {"location":{"start":{"line":14,"column":5},"end":{"line":14,"column":8},"identifierName":"str","source":"test/error-handler/call.js"},"severity":"RecoverableError","errorCode":"PP0006"}]

function foo(){};
var f = global.__makePartial ? __makePartial(foo) : foo;
var o = global.__abstract ? __abstract("object", "({})") : {};
if (global.__makeSimple) __makeSimple(o);

f();
o();
o.m();

var str = global.__abstract ? __abstract("string", "('xxx')") : "xxx";
eval(str);
