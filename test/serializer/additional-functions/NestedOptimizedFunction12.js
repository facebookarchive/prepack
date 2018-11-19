(function() {
  function f() {
    var shared = { huge: { huge: { huge: { huge: { huge: { huge: { huge: 42 } } } } } } };
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
  var a = f();
  global.inspect = function() {
    return a[0]() === a[1]();
  };
})();
