// cannot serialize

let ob = global.__makePartial ? __makeSimple(__makePartial({})) : {};
var n = global.__abstract ? __abstract("string", '("a")') : "a";

z = ob[n];

inspect = function() {
  return global.z;
};
