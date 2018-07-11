// throws introspection error

let x = global.__abstract ? __abstract("boolean", "true") : true;
let ob = global.__abstract ? __abstract("object", "({})") : {};
if (global.__makeSimple) global.__makeSimple(ob);

let p = x ? undefined : ob.p;

var y = Object.create(Object.prototype, p);

inspect = function() {
  return "" + y;
};
