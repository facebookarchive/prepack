// throws introspection error

let x = global.__abstract ? __abstract("boolean", "true") : true;

try {
  if (x) z = "is true"; else throw "is false";
} finally {
  z = "is finally";
}

inspect = function() { return z; }
