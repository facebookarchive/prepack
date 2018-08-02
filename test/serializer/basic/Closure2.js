var f = function() {
  for (var i = 0; ; ) {
    var j = 0;
    return function() {
      j += 1;
      return j;
    };
  }
};

var g = f();

inspect = function() {
  return g() + " " + g();
};
