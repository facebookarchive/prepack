var c = global.__abstract ? __abstract("boolean", "false") : false;
var a = {};
if (c) a.f = a;

inspect = function() {
  return "f" in a;
};
