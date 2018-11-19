// (It fails because of an output mismatch.)

(function() {
  function f() {
    var shared = {};
    function g() {
      return shared;
    }
    return [g, g];
  }
  var a = f();
  var g0 = a[0];
  var g1 = a[1];
  if (global.__optimize) {
    __optimize(g0);
    __optimize(g1);
  }
  global.inspect = function() {
    return g0() === g1();
  };
})();
