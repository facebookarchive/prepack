// Copies of 42:1
(function() {
  function f() {
    return global.x;
  }
  f.prop = 42;
  function g1() {
    return f;
  }
  function g2() {
    return f;
  }
  if (global.__optimize) {
    __optimize(g1);
    __optimize(g2);
  }
  global.inspect = function() {
    return g1() === g2();
  };
})();
