// recover-from-errors
// expected errors: [{"location":{"start":{"line":5,"column":45},"end":{"line":5,"column":46},"source":"test/error-handler/object-assign4.js"},"severity":"RecoverableError","errorCode":"PP0017"},{"location":{"start":{"line":5,"column":45},"end":{"line":5,"column":46},"source":"test/error-handler/object-assign4.js"},"severity":"FatalError","errorCode":"PP0001"}]

var obj = global.__abstract && global.__makePartial && global.__makeSimple ? __makeSimple(__makePartial(__abstract({}, "({foo:1})"))) : {foo:1};
var copyOfObj = Object.assign({}, obj, {foo: 2});

// Demonstrates the issue we would get
// if this hadn't been marked as an error.
inspect = function() {
  return JSON.stringify(copyOfObj);
}
