(function() {
  function f(g) {
    var x = 23;
    function f() {
      x = x + 42;
    }
    g(f);
    return x;
  }
  global.__optimize && __optimize(f);
  global.inspect = function() {
    return f(g => g());
  };
})();
