// does not contain: ==
function abstract(t, n) {
  if (global.__abstract) return __abstract(t, n);
  return eval(n);
}
var n = abstract("number", "1");
var numberIsNull = n == null;
var b = abstract("boolean", "false");
var booleanIsNull = b == null;
var s = abstract("string", "'foo'");
var stringIsNull = s == null;
var o = abstract("object", "({})");
var objectIsNull = o == null;

inspect = function() {
  return [numberIsNull, booleanIsNull, stringIsNull, objectIsNull].join(" ");
};
