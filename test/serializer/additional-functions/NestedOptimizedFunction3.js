(function() {
  function f() {
    function g() {
      return {}; // Must maintain distinct identity of object
    }
    if (global.__optimize) __optimize(g);
    return [g, g];
  }
  if (global.__optimize) __optimize(f);
  global.inspect = function() {
    var a = f();
    return a[0]() !== a[1]();
  };
})();
