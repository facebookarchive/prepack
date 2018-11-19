var g, h;
var f = function() {
  var i = 42;
  g = function() {
    return i;
  };
  h = function() {
    i += 1;
    return i;
  };
};

f();

inspect = function() {
  return g() + " " + h() + " " + g();
};
