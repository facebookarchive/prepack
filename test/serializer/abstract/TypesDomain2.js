// throws introspection error

let x = global.__abstract ? global.__abstract("boolean", "true") : true;

let p = x ? 1 : {};

var z = isFinite(p);

inspect = function() {
  return "" + z;
};
