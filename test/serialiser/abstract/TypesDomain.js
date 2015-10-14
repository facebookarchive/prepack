let x = global.__abstract ? __abstract("boolean", "true") : true;

let o = x ? {} : ()=>1;

z = o || "no no no";

z1 = Number.isFinite(o);

inspect = function() { return "" + z + z1; }
