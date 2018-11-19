// Copies of f;:2
function f() {
  return 123;
}
var g = global.__abstractOrNullOrUndefined ? __abstractOrNullOrUndefined("function", "f") : f;
var z = g && g();

inspect = function() {
  return "" + z;
};
