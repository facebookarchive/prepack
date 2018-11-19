// skip this test for now
var obj =
  global.__abstract && global.__makePartial && global.__makeSimple
    ? __makeSimple(__makePartial(__abstract({}, "({foo:1, [Symbol.split]:999})")))
    : { foo: 1, [Symbol.split]: 999 };

var copyOfObj = Object.assign({}, obj);
var copyOfCopyOfObj = Object.assign({}, copyOfObj);
copyOfObj.x = 10;
let oldSplit = copyOfObj[Symbol.split];
copyOfObj[Symbol.split] = 3;

inspect = function() {
  return oldSplit + " " + JSON.stringify(copyOfCopyOfObj);
};
