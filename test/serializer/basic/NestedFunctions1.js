// Copies of x: 2
(function() {
  global.f = function() {
    return function() {
      /* This makes the function too big to inline. */
      var x = 10;
      return 2 * x;
    }
  }
  global.g1 = f();
  global.g2 = f();
  inspect = function() {
    return g1() + g2();
  }
})();
