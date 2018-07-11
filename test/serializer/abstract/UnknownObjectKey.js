var o = global.__abstract
  ? global.__abstract("object", '({toString() { return "x"; }})')
  : {
      toString() {
        return "x";
      },
    };
if (global.__makeSimple) global.__makeSimple(o);
if (global.__makePartial) global.__makePartial(o);
var result = { x: "a" }[o];
inspect = function() {
  return result;
};
