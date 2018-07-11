let x = global.__abstract ? __abstract("string", "('a,b,c,d,e')") : "a,b,c,d,e";
let sliced = x.slice(2, 3);
let split = x.split(",", 2);

inspect = function() {
  return sliced + split.join(":");
};
