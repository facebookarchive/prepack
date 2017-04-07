let ob = global.__abstract ? __abstract({p: 1}, "({p: 1})") : {p: 1};
z = Reflect.has(ob, "p");

let b = global.__abstract ? __abstract("boolean", "true") : true;
ob = b ? {p : 1} : {p : 2};
z1 = Reflect.has(ob, "p");

inspect = function() { return "" + z + z1; }
