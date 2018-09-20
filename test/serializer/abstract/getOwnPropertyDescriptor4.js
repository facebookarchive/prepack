let x = global.__abstract ? __abstract("boolean", "true") : true;
let ob = x ? { a: 1 } : { b: 2 };
let desc = Object.getOwnPropertyDescriptor(ob, "a");
inspect = function() {
  return desc;
};
