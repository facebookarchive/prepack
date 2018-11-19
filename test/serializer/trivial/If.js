// no effect
// omit invariants
let x = global.__abstract ? __abstract("boolean", "true") : true;
let o = new Object();
if (x) o.x = 42;
else o.x = 23;
