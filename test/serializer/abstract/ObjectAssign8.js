var __evaluatePureFunction = this.__evaluatePureFunction || (f => f());
var obj =
  global.__abstract && global.__makePartial && global.__makeSimple
    ? __makeSimple(__makePartial(__abstract({}, "({foo:1})")))
    : { foo: 1 };
var x;

__evaluatePureFunction(() => {
  x = {};
  var y = {};
  Object.assign(x, obj, y, { bar: 2 });
  y.foo = 2;
});

inspect = function() {
  return JSON.stringify(x);
};
