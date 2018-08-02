// Copies of .assign;:1

global.f = function() {
  var x = global.__abstract ? global.__abstract({}, "({a: 1})") : { a: 1 };
  var val = {};
  Object.assign(val, x);
  return [1, val];
};

if (global.__optimize) __optimize(f);

global.inspect = function() {
  return JSON.stringify(global.f());
};
