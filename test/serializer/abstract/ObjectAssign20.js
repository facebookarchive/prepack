// abstract effects

var __evaluatePureFunction = this.__evaluatePureFunction || (f => f());
var obj =
  global.__abstract && global.__makePartial && global.__makeSimple
    ? __makeSimple(__makePartial(__abstract({}, "({foo:1})")))
    : { foo: 1 };
var b = global.__abstract ? global.__abstract("boolean", "(true)") : true;

var copyOfObj = {};
__evaluatePureFunction(() => {
  if (b) Object.assign(copyOfObj, obj, { foo: 2 });
  else {
    Object.assign(copyOfObj, obj, { foo: 3 });
  }
});

inspect = function() {
  return JSON.stringify(copyOfObj);
};
