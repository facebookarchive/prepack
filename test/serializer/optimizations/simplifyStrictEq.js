// does not contain: ===
function abstract(t, n) {
  if (global.__abstract) return __abstract(t, n);
  return eval(n);
}
var n = abstract("number", "1");
var numberIsNull = n === null;
var b = abstract("boolean", "false");
var booleanIsNull = n === null;
var s = abstract("string", "'foo'");
var stringIsNull = n === null;
var o = abstract("object", "({})");
var objectIsNull = o === null;
var stringIsNumber = n === s;
var stringIsUndefined = s === undefined;

inspect = function() {
  return [numberIsNull, booleanIsNull, stringIsNull, objectIsNull, stringIsNumber, stringIsUndefined].join(" ");
};
