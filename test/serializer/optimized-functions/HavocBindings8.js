function fn(x, y, abstractVal) {
  var value = x.toString();

  if (y) {
    abstractVal(function() {
      value += "-next";
    });
  }
  return value;
}

global.__optimize && __optimize(fn);

inspect = function() {
  return fn(10, false, function() {});
};
