// does contain:42
(function() {
  function f(g) {
    const x = 23;
    function f() {
      return x;
    }
    g(f);
    return x + 19;
  }
  global.__optimize && __optimize(f);
  global.inspect = function() {
    return f(g => g());
  };
})();
