// recover-from-errors
// expected errors: [{"location":{"start":{"line":17,"column":22},"end":{"line":17,"column":27},"identifierName":"proto","source":"test/error-handler/object-assign11.js"},"severity":"FatalError","errorCode":"PP0001"}]

var obj = global.__abstract && global.__makePartial && global.__makeSimple ? __makeSimple(__makePartial(__abstract({}, "({foo:1})"))) : {foo:1};

var copyOfObj = {};
var y = 0;
Object.assign(copyOfObj, obj);

var proto = {};
Object.defineProperty(proto, 'foo', {
  enumerable: true,
  set() {
    y = 42;
  }
});
copyOfObj.__proto__ = proto;

// Demonstrates the issue we would get
// if this hadn't been marked as an error.
inspect = function() {  
  return JSON.stringify(y);
}