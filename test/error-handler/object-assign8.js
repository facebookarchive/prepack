// recover-from-errors
// expected errors: [{"location":{"start":{"line":9,"column":14},"end":{"line":9,"column":18},"source":"test/error-handler/object-assign8.js"},"severity":"FatalError","errorCode":"PP0001"}]

var obj = global.__abstract && global.__makePartial && global.__makeSimple ? __makeSimple(__makePartial(__abstract({}, "({foo:1})"))) : {foo:1};

var copyOfObj = {};
Object.assign(copyOfObj, obj);
Object.defineProperty(copyOfObj, 'x', {
  enumerable: true,
  get() {
    return 10;
  },
});

// Demonstrates the issue we would get
// if this hadn't been marked as an error.
inspect = function() {  
  return JSON.stringify(copyOfObj);
}