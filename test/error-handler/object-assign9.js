// recover-from-errors
// expected errors: [{"location":{"start":{"line":10,"column":14},"end":{"line":10,"column":18},"source":"test/error-handler/object-assign9.js"},"severity":"FatalError","errorCode":"PP0001"}]

var obj = global.__abstract && global.__makePartial && global.__makeSimple ? __makeSimple(__makePartial(__abstract({}, "({foo:1})"))) : {foo:1};

var copyOfObj = {};
var y = 0;
Object.assign(copyOfObj, obj);
Object.defineProperty(copyOfObj, 'foo', {
  enumerable: true,
  set() {
    y = 42;
  }
});

// Demonstrates the issue we would get
// if this hadn't been marked as an error.
inspect = function() {  
  return JSON.stringify(y);
}