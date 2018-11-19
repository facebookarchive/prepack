let x = global.__abstract ? __abstract("string", "('a,b,c,d,e')") : "a,b,c,d,e";
let length = x.length;

inspect = function() {
  return length;
};
