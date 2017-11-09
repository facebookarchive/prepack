function f() { return 123; }
var g = global.__abstractOrNull ? __abstractOrNull("function", "null") : null;
z = undefined;
if (g !== null)
  z = g();

inspect = function() { return "" + z }
