var obj =
  global.__abstract && global.__makePartial && global.__makeSimple
    ? __makeSimple(__makePartial(__abstract({}, "({foo:1})")))
    : { foo: 1 };

var x = {};
var y = { [Symbol.split]: 3 };
Object.assign(x, obj, y, { bar: 2 });
y.foo = 2;
y[Symbol.split] = 4;

inspect = function() {
  return JSON.stringify(x);
};
