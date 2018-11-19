var obj =
  global.__abstract && global.__makePartial && global.__makeSimple
    ? __makeSimple(__makePartial(__abstract({ foo: __abstract("number") }, "({foo:1})")))
    : { foo: 1 };

var copyOfObj = {};
Object.assign(copyOfObj, obj);
delete copyOfObj.foo;

inspect = function() {
  return JSON.stringify(copyOfObj);
};
