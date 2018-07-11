var n = global.__abstract ? global.__abstract("number", "(0)") : 0;
var result = { 0: "a" }[n];
inspect = function() {
  return result;
};
