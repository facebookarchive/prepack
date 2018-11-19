var b = global.__abstract ? global.__abstract("boolean", "(true)") : true;
var n = global.__abstract ? global.__abstract("number", "(0)") : 0;
b[n] = "noop";
inspect = function() {
  return b["0"];
};
