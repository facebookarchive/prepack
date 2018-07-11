// does not contain:1 + 2
(function() {
  function g() {
    return 1 + 2;
  }
  function f() {
    if (global.__optimize) __optimize(g);
    return g;
  }
  if (global.__optimize) __optimize(f);
  global.inspect = function() {
    return f()();
  };
})();
