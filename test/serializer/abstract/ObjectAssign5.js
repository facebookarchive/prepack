var obj =
  global.__abstract && global.__makePartial && global.__makeSimple
    ? __makeSimple(__makePartial(__abstract({}, "({foo:1})")))
    : { foo: 1 };
var copyOfObj = Object.assign({}, obj);
var copyOfCopyOfObj = Object.assign({}, copyOfObj);

inspect = function() {
  return JSON.stringify(copyOfCopyOfObj);
};
