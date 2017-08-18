var x = global.__abstract ? __abstract("boolean", "true") : true;
var a = [42];
o = global.__makePartial ? __makePartial(a) : a;
if (x) delete o[0];
inspect = function() { return o[0]; }
