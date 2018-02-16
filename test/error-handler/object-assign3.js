// recover-from-errors
// expected errors: [{"location":{"start":{"line":8,"column":22},"end":{"line":8,"column":23},"identifierName":"y","source":"test/error-handler/object-assign3.js"},"severity":"RecoverableError","errorCode":"PP0017"}]

var obj = global.__abstract && global.__makePartial && global.__makeSimple ? __makeSimple(__makePartial(__abstract({}, "({foo:1})"))) : {foo:1};

var x = {};
var y = {};
Object.assign(x, obj, y);
y.foo = 2;