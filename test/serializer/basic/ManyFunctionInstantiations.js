var f = function(i) {
  return function() {
    /* don't inline don't inline don't inline I am too big */
    return i;
  };
};

var g = function(i) {
  return function() {
    /* don't inline don't inline don't inline I am too big */
    return i;
  };
};

var h = [f(1), g(2), f(3), g(4), f(5), g(6)];

inspect = function() {
  return h[0]() + " " + h[1]() + " " + h[2]() + " " + h[3]() + " " + h[4]() + " " + h[5]();
};
