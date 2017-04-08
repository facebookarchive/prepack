let x = global.__abstract ? __abstract("boolean", "true") : true;

o1 = { x: 23 };
o2 = { x: 12 };
let a = x ? o1 : o2;
a.x = 42;
y = o1.x;
o1.x = 99;

inspect = function() { return "" + y + "-" + o1.x + "-" + o2.x; };
