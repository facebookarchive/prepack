// recover-from-errors
// expected errors: [{"location":{"start":{"line":9,"column":14},"end":{"line":9,"column":16},"source":"test/error-handler/object-assign5.js"},"severity":"FatalError","errorCode":"PP0001"}]

var obj = global.__abstract && global.__makePartial && global.__makeSimple ? __makeSimple(__makePartial(__abstract({}, "({foo:1})"))) : {foo:1};

var copyOfObj = Object.assign({}, obj);
var copyOfCopyOfObj = Object.assign({}, copyOfObj);

copyOfObj.x = 10;

// Demonstrates the issue we would get
// if this hadn't been marked as an error.
inspect = function() {  
  return JSON.stringify(copyOfCopyOfObj);
}