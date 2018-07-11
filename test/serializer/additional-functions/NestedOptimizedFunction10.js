(function() {
  function f() {
    var shared = {};
    function g() {
      return shared;
    }
    return g;
  }
  var g = f();
  if (global.__optimize) {
    __optimize(f);
    __optimize(g);
  }
  global.inspect = function() {
    return f()() !== g();
  };
})();
