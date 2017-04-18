// throws introspection error

let x = global.__abstract ? __abstract("boolean", "true") : true;
let ob = global.__abstract ? __abstract({}, "({})") : {};
if (global.__makeSimple) global.__makeSimple(ob);

let p = x ? {} : ob.p;

y = Object.prototype.isPrototypeOf(p);

inspect = function() { return "" + y; }
