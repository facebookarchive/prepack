let n = global.__abstract ? __abstract("number", "1") : 1;
let o = global.__abstract ? __abstract("object", "({})") : {};
let opt = n ? o : undefined;

x = !!n;
y = opt !== undefined;

inspect = function() { return "" + x + " " + y; }
