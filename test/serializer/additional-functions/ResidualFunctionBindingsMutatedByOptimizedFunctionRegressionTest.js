// expected Warning: PP1007
(function() {
  let x = 23;
  function g() {
    return x;
  }
  function f() {
    x = 42;
    return g;
  }
  if (global.__optimize) __optimize(f);
  global.f = f;
  inspect = function() {
    return x + "+19=" + f()();
  };
})();
