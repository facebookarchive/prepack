// TODO: add copies checking after handling FunctionDeclaration
var f = function() {
  function nested() {
    var x0 = 1;
    var x1 = x0 + x0;
    var x2 = x1 + x1;
    var x3 = x2 + x2;
    var x4 = x3 + x3;
    return x4;
  }
  return nested;
};
var g = f();
inspect = function() {
  return g();
};
