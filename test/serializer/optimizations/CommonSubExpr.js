let x = global.__abstract ? __abstract("number", "10") : 10;
global.a = x + 1;
global.b = x + 1;

inspect = function() {
  return global.a + global.b;
};
