(function() {
  function f() {
    var shared = {};
    function g() {
      return shared;
    }
    if (global.__optimize) __optimize(g);
    return [g, g, shared];
  }
  if (global.__optimize) __optimize(f);
  global.inspect = function() {
    var a = f();
    return a[2] == a[0]() && a[2] == a[1]();
  };
})();
