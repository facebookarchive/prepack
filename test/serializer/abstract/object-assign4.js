// abstract effects
var __evaluatePureFunction = this.__evaluatePureFunction || (f => f());
var obj =
  global.__abstract && global.__makePartial && global.__makeSimple
    ? __makeSimple(__makePartial(__abstract({}, "({foo:1})")))
    : { foo: 1 };

// Intentionally allocate outside the pure scope.
var copyOfObj = {};

__evaluatePureFunction(() => {
  Object.assign(copyOfObj, obj);
  // Normally at this point we would leak it,
  // but we can't because it was created outside the pure scope.
  copyOfObj.x = 10;
});

inspect = function() {
  return JSON.stringify(copyOfObj);
};
