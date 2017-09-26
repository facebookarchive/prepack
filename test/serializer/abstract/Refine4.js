let x = global.__abstract ? __abstract("boolean", "true") : true;
let ob = x ? { y: "z" } : null;
z = ob != null && ob;
z1 = (ob != null || x) || ob;

inspect = function() { return z.y + z1; }
