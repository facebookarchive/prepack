let x = global.__abstract ? global.__abstract("boolean", "true") : true;

let o = x ? {} : () => 1;

var z = o || "no no no";

var z1 = Number.isFinite(o);

inspect = function() {
  return "" + z + z1;
};
