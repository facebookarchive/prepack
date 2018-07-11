// serialized function clone count: 0
var f = function(x) {
  var i = x > 5 ? 0 : 1;
  var j = x % 2 === 0 ? 3 : 5;
  return function() {
    i += 1;
    j -= 3;
    return i + j;
  };
};

var g = [f(2), f(6), f(3), f(9)];

inspect = function() {
  return g[0]() + " " + g[1]() + " " + g[2]() + " " + g[3]();
};
