let o = global.__abstract ? __makeSimple(__abstract("object", "({})")):  { };
let p = global.__abstract ? __makeSimple(__abstract("object", "({ toString: () => 'x' })")):  { toString: () => 'x' };
o[p] = p;
x = Array.isArray(o);
y = typeof o[p];

inspect = function() { return x + " " + y; }
