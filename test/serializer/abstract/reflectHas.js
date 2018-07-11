let ob = global.__makePartial ? __makePartial({ p: 1 }) : { p: 1 };
var z = Reflect.has(ob, "p");

let b = global.__abstract ? __abstract("boolean", "true") : true;
ob = b ? { p: 1 } : { p: 2 };
var z1 = Reflect.has(ob, "p");

inspect = function() {
  return "" + z + z1;
};
