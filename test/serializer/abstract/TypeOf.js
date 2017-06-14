var x = 42;
y = global.__abstract ? __abstract("number", x.toString()) : x;
s = typeof y;

let f = y ? ()=>1 : ()=>2;
t = typeof f;

let yy = y * y;
u = typeof yy;

let b = y > 3;
v = typeof b;

inspect = function() { return s + t + u + v; }
