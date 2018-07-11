let num = global.__abstract ? __abstract("number", "42") : 42;
let err = new Error(num);

inspect = function() {
  return "" + err;
};
