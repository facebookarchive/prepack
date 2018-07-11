var f = function() {
  var i = 0;
  return function() {
    i += 1;
    return i;
  };
};

var g = f();

inspect = function() {
  return g() + " " + g();
};
