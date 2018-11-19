let x = global.__abstract ? __abstract("boolean", "true") : true;
let mustBeFalse = (x ? 1 : 2) > (x ? 3 : 4);
let mustBeTrue = (x ? 1 : 2) < (x ? 3 : 4);
let y = x ? "abc" : "def";
let b = x ? x : false;
var z = x && y;
var z1 = mustBeFalse || (mustBeFalse && y);
var z2 = x && y && "xxx";
var z3;
var z4;
if (x || "yyy") z3 = "zzz";
else z3 = "xyz";
if (x || false) z4 = "zzz";
else z4 = "xyz";

inspect = function() {
  return "" + z + z1 + z2 + z3 + z4;
};
