(function() {
  function f() {
    var shared = {};
    function g() {
      var unique = {};
      return [shared, unique];
    }
    if (global.__optimize) __optimize(g);
    return [g, g, shared];
  }
  if (global.__optimize) __optimize(f);
  global.inspect = function() {
    var a = f();
    let a0 = a[0]();
    let a1 = a[1]();
    let shared = a[2];
    return a0[0] === shared && a1[0] === shared && a0[1] !== shared && a1[1] !== shared && a0[1] !== a1[1];
  };
})();
