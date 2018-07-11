(function() {
  function f(g) {
    var x = {};
    global.__makeFinal && __makeFinal(x);
    function f() {
      x = 42;
    }
    g(f);
    return x;
  }
  global.__optimize && __optimize(f);
  global.inspect = function() {
    return f(g => g());
  };
})();
