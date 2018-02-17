// abstract effects
// recover-from-errors
// expected errors: [{"location":{"start":{"line":15,"column":16},"end":{"line":15,"column":18},"source":"test/error-handler/object-assign12.js"},"severity":"FatalError","errorCode":"PP0001"}]

var __evaluatePureFunction = this.__evaluatePureFunction || (f => f());
var obj = global.__abstract && global.__makePartial && global.__makeSimple ? __makeSimple(__makePartial(__abstract({}, "({foo:1})"))) : {foo:1};

// Intentionally allocate outside the pure scope.
var copyOfObj = {};

__evaluatePureFunction(() => {
  Object.assign(copyOfObj, obj);
  // Normally at this point we would leak it,
  // but we can't because it was created outside the pure scope.
  copyOfObj.x = 10;
});

// Demonstrates the issue we would get
// if this hadn't been marked as an error.
inspect = function() {  
  return JSON.stringify(copyOfObj);
}
