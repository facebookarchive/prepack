// recover-from-errors
// expected errors: [{"location":{"start":{"line":5,"column":34},"end":{"line":5,"column":37},"identifierName":"obj","source":"test/error-handler/object-assign.js"},"severity":"FatalError","errorCode":"PP0001"}]

var obj = global.__abstract && global.__makePartial ? __makePartial(__abstract({}, "({foo:1})")) : { foo: 1 };
var copyOfObj = Object.assign({}, obj);
