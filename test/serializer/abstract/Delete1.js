var obj = global.__abstract ? __abstract({ p: 41 }, "({ p: 41} )") : { p: 41 };
delete obj.p;
z = obj.p;

inspect = function() { return z; }
