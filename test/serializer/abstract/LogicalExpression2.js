let x = global.__abstract ? __abstract("boolean", "true") : true;
let mustBeFalse = (x ? 1 : 2) > (x ? 3 : 4);
let mustBeTrue = (x ? 1 : 2) < (x ? 3 : 4);
let y = x ? "abc" : "def";
let b = x ? x : false;
z = x && y;
z1 = mustBeFalse || (mustBeFalse && y);
z2 = x && y && "xxx";
if (x || "yyy") z3 = "zzz"; else z3 = "xyz";
if (x || false) z4 = "zzz"; else z4 = "xyz";

inspect = function() { return "" + z + z1 + z2 + z3 + z4; }
