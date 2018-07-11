function f() {
  return arguments;
}

var x = f(42, "b", true);

inspect = function() {
  return "" + x[0] + x[1] + x[2] + x.length + (x.callee === f) + (x.caller !== undefined);
};
