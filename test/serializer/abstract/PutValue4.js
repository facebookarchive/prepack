let x = global.__abstract ? __abstract("boolean", "true") : true;

var o1 = { x: 23 };
var o2 = { x: 12 };
let a = x ? o1 : o2;
a.x = 42;
var y = o1.x;
o1.x = 99;

inspect = function() {
  return "" + y + "-" + o1.x + "-" + o2.x;
};
