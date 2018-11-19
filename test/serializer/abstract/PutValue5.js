let x = global.__abstract ? __abstract("boolean", "true") : true;

let obj = { x: 123 };

var o = x ? obj : { y: 456 };

o.y = 42;

inspect = function() {
  return JSON.stringify(o);
};
