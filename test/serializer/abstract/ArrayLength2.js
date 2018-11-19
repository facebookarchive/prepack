var x = global.__abstract ? __abstract("boolean", "true") : true;
var a = [];
var b = x ? a : [];
if (b === a) {
  a.push(42);
}
inspect = function() {
  return a.length;
};
