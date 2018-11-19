// throws introspection error

var b = global.__abstract ? __abstract("boolean", "true") : true;
var o = global.__abstract ? __abstract("object", "({})") : {};

try {
  x1 = o instanceof b;
} catch (err) {
  x1 = err;
}

inspect = function() {
  return "" + x1;
};
