var i = 0;
var f = function() {
  i += 1;
  return i.toString();
};

inspect = function() {
  return f() + " " + f();
};
