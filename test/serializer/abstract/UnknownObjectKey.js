var o = global.__abstract ? __abstract('object', '({toString() { return "x"; }})') : {toString() { return "x"; }};
if (global.__makeSimple) __makeSimple(o);
if (global.__makePartial) __makePartial(o);
result = {'x':'a'}[o];
inspect = function() {
  return result;
}
