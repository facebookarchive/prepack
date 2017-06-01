// serialized function clone count: 1
var f = function(x) {
  var i = x > 5 ? 0 : 1;
  return function() {
    i += 1;
    return i;
  }
}

var g = [f(2), f(6), f(4), f(9)];

inspect = function() { return g[0]() + " " + g[1]() + " " + g[2]() + " " + g[3](); }
