var x = global.__abstract ? __abstract("boolean", "true") : true;
var a = [];
if (x) a.push(42);
inspect = function() {
  return a.length;
};
