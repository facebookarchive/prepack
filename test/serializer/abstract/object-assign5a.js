// skip this test for now
var obj =
  global.__abstract && global.__makePartial && global.__makeSimple
    ? __makeSimple(__makePartial(__abstract({}, "({foo:1})")))
    : { foo: 1 };

var copyOfObj = Object.assign({}, obj);
copyOfObj[Symbol.split] = 10000;
var copyOfCopyOfObj = Object.assign({}, copyOfObj);
let copyOfCopyOfObjSplit = copyOfCopyOfObj[Symbol.split];
copyOfObj[Symbol.split] = 20000;
let copyOfObjSplit = copyOfObj[Symbol.split];

inspect = function() {
  return copyOfCopyOfObjSplit + JSON.stringify(copyOfCopyOfObj) + copyOfObjSplit;
};
