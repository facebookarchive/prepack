var o = global.__abstract ? __abstract('object', '({toString() { return "x"; }})') : {toString() { return "x"; }};
if (global.__makeSimple) __makeSimple(o);
if (global.__makePartial) __makePartial(o);
var obj = {'x':'a'};
obj[o] = 'b';
inspect = function() {
  return obj.x;
}
