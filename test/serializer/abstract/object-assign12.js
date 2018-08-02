var obj =
  global.__abstract && global.__makePartial && global.__makeSimple
    ? __makeSimple(__makePartial(__abstract({}, "({foo:1})")))
    : { foo: 1 };
var copyOfObj = Object.assign({}, { foo: 2 }, obj);
copyOfObj.foo = 123;
Object.assign(copyOfObj, obj);
let f = copyOfObj.foo;

inspect = function() {
  return f;
};
