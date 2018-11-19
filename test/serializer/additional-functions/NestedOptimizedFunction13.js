(function() {
  function f() {
    let shared = Date.now();
    function g0() {
      return [shared, Date.now()];
    }
    function g1() {
      return [shared, Date.now()];
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
    var a0 = a[0]();
    var a1 = a[1]();
    return a0[0] === a1[0] && a0[1] <= a1[1];
  };
})();
