// Copies of x: 2
(function() {
  global.f = function() {
    return function() {
      return function() {
        /* This makes the function too big to inline. */
        var x = 10;
        return 2 * x;
      };
    };
  };
  global.g1 = f();
  global.g2 = f();
  global.h1 = g1();
  global.h2 = g1();
  inspect = function() {
    return global.g1()() + global.g2()() + global.h1() + global.h2();
  };
})();
