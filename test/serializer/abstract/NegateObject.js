y = global.__abstract ? __abstract("object", "({})") : {};
let z = !y;
// Once intrinsic objects can be designated not null/undefined, invert the condition below: see issue #1001
if (global.__isAbstract && !__isAbstract(z)) throw new Error("bug!");
x = z;
inspect = function() { return x; }
