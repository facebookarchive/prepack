let x = global.__abstract ? __abstract("boolean", "true") : true;

try {
  if (x) throw "is true"; else throw "is false";
} catch (e) {
  z = e;
}

inspect = function() { return "" + z; }
