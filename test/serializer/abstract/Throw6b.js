// Copies of _\$1 = _\$2.Date.now():1
let x = global.__abstract ? __abstract("boolean", "true") : true;

function foo(b) {
  if (b) throw new Error("" + Date.now());
  return "is false";
}
let z = foo(!x);

inspect = function() {
  return z;
};
  