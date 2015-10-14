let x = global.__abstract ? __abstract("boolean", "true") : true;
let y = x ? 1 : 2;
z = y;
z1 = x ? { a : 123 } : { y : 456 };
inspect = function() { return z + JSON.stringify(z1); }
