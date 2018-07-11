let x = global.__abstract ? __abstract("number", "42") : 42;
let s = x.toString();
let t = s.toString();
inspect = function() {
  return t;
};
