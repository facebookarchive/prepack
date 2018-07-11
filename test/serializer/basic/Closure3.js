var f = function() {
  var i = 42;
  return function() {
    return i;
  };
};

var g = f();

inspect = function() {
  return g() + " " + g();
};
