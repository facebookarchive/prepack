// cannot serialize

let ob = global.__abstract ? __abstract({}, "({a: 1})") : {a: 1};
if (global.__makeSimple) __makeSimple(ob);
var n = global.__abstract ? __abstract("string", '("a")') : "a";

z = ob[n];

inspect = function() { return z; }
