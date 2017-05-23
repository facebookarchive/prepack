function f(v) { return v*2; }
var g = global.__abstract ? global.__abstract(f, "f") : f;
let v = [1].map(g)

inspect = function() { return v }
