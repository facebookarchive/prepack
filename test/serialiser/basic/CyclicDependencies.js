a = { v: 42 };
b = { a: a };
a.b = b;

inspect = function() { return a.b.a.b.a.b.a.b.a.b.a.b.a.b.a.v; }
