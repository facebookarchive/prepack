var obj =
  global.__abstract && global.__makePartial && global.__makeSimple
    ? __makeSimple(__makePartial(__abstract({ foo: __abstract("number") }, "({foo:1})")))
    : { foo: 1 };

var copyOfObj = {};
Object.assign(copyOfObj, obj);
copyOfObj.foo = 2;

inspect = function() {
  return JSON.stringify(copyOfObj);
};
