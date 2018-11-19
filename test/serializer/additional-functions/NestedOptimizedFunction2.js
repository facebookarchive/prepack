// does not contain:1 + 2
(function() {
  function f() {
    function g() {
      return 1 + 2;
    }
    if (global.__optimize) __optimize(g);
    return g;
  }
  if (global.__optimize) __optimize(f);
  global.inspect = function() {
    return f()();
  };
})();
