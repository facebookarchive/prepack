var x = 42;
y = global.__abstract ? __abstract("number", x.toString()) : x;
s = typeof y;

let f = y ? ()=>1 : ()=>2;
t = typeof f;

inspect = function() { return s + t; }
