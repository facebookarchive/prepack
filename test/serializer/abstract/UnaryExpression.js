var x = global.__abstract ? global.__abstract("number", "42") : 42;
var y1 = -x;
var y2 = ~x;
var y3 = !x;
var y4 = typeof x;
inspect = function() {
  return "" + y1 + y2 + y3 + y4;
};
