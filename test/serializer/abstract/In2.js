// throws introspection error

var b = global.__abstract ? __abstract("boolean", "true") : true;
var p = global.__abstract ? __abstract("string", '("abc")') : "abc";

var x1 = "xyz" in {};
try {
  x2 = "xyz" in b;
} catch (err) {
  if (err instanceof TypeError) x2 = true;
}
try {
  var x3 = p in b;
} catch (err) {
  if (err instanceof TypeError) x3 = true;
}

inspect = function() {
  return "" + x1 + x3;
};
