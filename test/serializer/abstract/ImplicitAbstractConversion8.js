let x = global.__abstract ? __abstract("number", "(3)") : 3;
let ob = { valueOf: () => x };
let y = x ** 2;
inspect = function() {
  return y;
};
