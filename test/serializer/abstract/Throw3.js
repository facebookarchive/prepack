let x = global.__abstract ? __abstract("boolean", "true") : true;

var z;
try {
  if (x) z = "is true";
  else throw "is false";
} catch (e) {
  z = e;
}

inspect = function() {
  return z;
};
