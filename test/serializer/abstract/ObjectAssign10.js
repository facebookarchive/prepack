var __evaluatePureFunction = this.__evaluatePureFunction || (f => f());
var obj =
  global.__abstract && global.__makePartial && global.__makeSimple
    ? __makeSimple(__makePartial(__abstract({}, "({foo:1})")))
    : { foo: 1 };
var copyOfCopyOfObj;

__evaluatePureFunction(() => {
  var copyOfObj = Object.assign({}, obj);
  copyOfCopyOfObj = Object.assign({}, copyOfObj);
  copyOfObj.x = 10;
});

inspect = function() {
  return JSON.stringify(copyOfCopyOfObj);
};
