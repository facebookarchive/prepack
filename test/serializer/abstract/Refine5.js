let x = global.__abstract ? __abstract("boolean", "true") : true;
let ob = x ? { y: "z" } : undefined;
z = ob != undefined && ob;
z1 = (ob != undefined || x) || ob;

inspect = function() { return z.y + z1; }
