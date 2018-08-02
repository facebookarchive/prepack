let x = global.__abstract ? __abstract("boolean", "true") : true;

let p1 = { p: 1 };
let p2 = { p: 2 };
let o1 = Object.create(p1);
let o2 = Object.create(p2);
let o = x ? o1 : o2;

var z = Object.getPrototypeOf(o);

inspect = function() {
  return z.p;
};
