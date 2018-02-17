// recover-from-errors
// expected errors: [{"location":{"start":{"line":8,"column":7},"end":{"line":8,"column":16},"identifierName":"copyOfObj","source":"test/error-handler/object-assign10.js"},"severity":"FatalError","errorCode":"PP0001"}]

var obj = global.__abstract && global.__makePartial && global.__makeSimple ? __makeSimple(__makePartial(__abstract({foo: __abstract('number')}, "({foo:1})"))) : {foo:1};

var copyOfObj = {};
Object.assign(copyOfObj, obj);
delete copyOfObj.foo;

// Demonstrates the issue we would get
// if this hadn't been marked as an error.
inspect = function() {  
  return JSON.stringify(copyOfObj);
}