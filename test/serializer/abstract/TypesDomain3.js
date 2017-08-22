// throws introspection error

let x = global.__abstract ? __abstract("boolean", "true") : true;
let ob = global.__abstract ? __abstract("object", "({})") : {};
if (global.__makeSimple) global.__makeSimple(ob);

let p = x ? 1 : ob.p;

z = Number.isFinite(p);

inspect = function() { return "" + z; }
