// Copies of assign\(:1
global.f = function() {
  var x = global.__abstract ? global.__abstract({}, "({})") : {};
  Object.assign({}, x);
  return 1;
};

if (global.__optimize) __optimize(f);

global.inspect = function() { return global.f(); }
