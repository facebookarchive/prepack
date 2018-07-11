// throws introspection error

let x = global.__abstract ? global.__abstract("boolean", "true") : true;
let ob = global.__abstract ? global.__abstract("object", "({})") : {};
if (global.__makeSimple) global.__makeSimple(ob);

let p = x ? 1 : ob.p;

var z = Number.isFinite(p);

inspect = function() {
  return "" + z;
};
