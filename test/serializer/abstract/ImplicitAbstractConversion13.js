let x = global.__abstract ? __abstract("number", "(3)") : 3;
let ob = { valueOf: () => x };
let y = 2 <= x;
inspect = function() {
  return y;
};
