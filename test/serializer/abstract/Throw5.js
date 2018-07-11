let x = global.__abstract ? __abstract("boolean", "true") : true;

function foo(b) {
  if (b) throw new Error("is true");
  return "is false";
}
var z;
try {
  z = foo(x);
} catch (e) {
  z = e;
}

inspect = function() {
  return z;
};
