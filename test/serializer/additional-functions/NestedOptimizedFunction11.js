(function() {
  function f() {
    var shared = {};
    function g0() {
      return shared;
    }
    function g1() {
      return shared;
    }
    if (global.__optimize) {
      __optimize(g0);
      __optimize(g1);
    }
    return [g0, g1];
  }
  if (global.__optimize) __optimize(f);
  global.inspect = function() {
    var a = f();
    return a[0]() === a[1]();
  };
})();
