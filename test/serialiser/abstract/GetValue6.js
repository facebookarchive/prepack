let ob = global.__abstract ? __abstract({}, "({a: 1})") : {a: 1};
if (global.__makeSimple) __makeSimple(ob);

z = ob.a;

inspect = function() { return z; }
