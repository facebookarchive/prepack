// does not contain: ==
function abstract(t, n) {
  if (global.__abstract) return __abstract(t, n);
  return eval(n);
}
var n = abstract("number", "1");
var numberIsUndefined = n == undefined;
var b = abstract("boolean", "false");
var booleanIsUndefined = b == undefined;
var s = abstract("string", "'foo'");
var stringIsUndefined = s == undefined;
var o = abstract("object", "({})");
var stringIsUndefined = o == undefined;

inspect = function() {
  return [numberIsUndefined, booleanIsUndefined, stringIsUndefined, stringIsUndefined].join(" ");
};
