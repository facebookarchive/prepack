// Copies of assign\(:0

global.f = function() {
  var x = global.__abstract ? global.__abstract({}, "({})") : {};
  global.__makeSimple && __makeSimple(x);
  var val = {};
  Object.assign(val, x);
  return 1;
};

if (global.__optimize) __optimize(f);

global.inspect = function() {
  return global.f();
};
