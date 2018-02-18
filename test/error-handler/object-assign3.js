// recover-from-errors
// expected errors: [{"location":{"start":{"line":9,"column":8},"end":{"line":9,"column":9},"source":"test/error-handler/object-assign3.js"},"severity":"FatalError","errorCode":"PP0001"}]

var obj = global.__abstract && global.__makePartial && global.__makeSimple ? __makeSimple(__makePartial(__abstract({}, "({foo:1})"))) : {foo:1};

var x = {};
var y = {};
Object.assign(x, obj, y, {bar: 2});
y.foo = 2;

// Demonstrates the issue we would get
// if this hadn't been marked as an error.
inspect = function() {
  return JSON.stringify(x);
}
