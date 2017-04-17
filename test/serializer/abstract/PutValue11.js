var c = global.__abstract ? __abstract("boolean", "false") : false;
a = {};
if (c) a.f = a;

inspect = function() { return 'f' in a; }
