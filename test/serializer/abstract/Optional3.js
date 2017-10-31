function f() { return 123; }
var g = global.__abstractOrNullOrUndefined ? __abstractOrNullOrUndefined("function", "f") : f;
z = g && g();

inspect = function() { return "" + z }
