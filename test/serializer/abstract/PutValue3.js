let x = global.__abstract ? __abstract("boolean", "true") : true;

let obj = { x: 123 };

var o = x ? obj : { x: 456 };

o.x = 42;

inspect = function() {
  return JSON.stringify(o);
};
