// throws introspection error

let x = global.__abstract ? __abstract("boolean", "true") : true;

let p = x ? 1 : {};

z = isFinite(p);

inspect = function() { return "" + z; }
