// does contain: 1002
var obj =
  global.__abstract && global.__makePartial && global.__makeSimple
    ? __makeSimple(__makePartial(__abstract({}, "({foo:1})")))
    : { foo: 1 };
var copyOfObj = Object.assign({}, obj, { foo: 2 });
let foo = copyOfObj.foo + 1000;

inspect = function() {
  return foo + " " + JSON.stringify(copyOfObj);
};
