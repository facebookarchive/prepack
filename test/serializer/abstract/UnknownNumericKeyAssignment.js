var n = global.__abstract ? global.__abstract("number", "(0)") : 0;
var obj = { 0: "a", 1: "b" };
obj[n] = "c";
inspect = function() {
  return JSON.stringify(obj);
};
