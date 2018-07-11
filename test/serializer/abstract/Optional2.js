function f() {
  return 123;
}
var g = global.__abstractOrUndefined ? __abstractOrUndefined("function", "f") : f;
if (g != null) {
  var z = g();
}

inspect = function() {
  return "" + z;
};
