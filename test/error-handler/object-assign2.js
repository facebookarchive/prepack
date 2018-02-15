// recover-from-errors
// expected errors: [{"location":{"start":{"line":5,"column":44},"end":{"line":5,"column":47},"identifierName":"obj","source":"test/error-handler/object-assign2.js"},"severity":"RecoverableError","errorCode":"PP0017"},{"location":{"start":{"line":5,"column":44},"end":{"line":5,"column":47},"identifierName":"obj","source":"test/error-handler/object-assign2.js"},"severity":"FatalError","errorCode":"PP0001"}]

var obj = global.__abstract && global.__makePartial && global.__makeSimple ? __makeSimple(__makePartial(__abstract({}, "({foo:1})"))) : {foo:1};
var copyOfObj = Object.assign({}, {foo: 2}, obj);
