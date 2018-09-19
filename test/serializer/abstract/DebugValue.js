let x = global.__abstract ? __abstract("boolean", "true") : true;
let ob = x ? { a: 1 } : { b: 2 };

global.__abstract ? __debugValue(ob) : {};
global.__abstract ? __debugValue([ob, x]) : {};

inspect = function() {
  return true;
};
