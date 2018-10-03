// does not contain:23
(function() {
  function f(c) {
    let h;
    if (c) {
      h = function() {
        return 23 + 42;
      };
      function g() {
        return h();
      }
      global.__optimize && __optimize(g);
      return g;
    }
  }
  global.__optimize && __optimize(f);
  global.f = f;

  global.inspect = function() {
    return f(true)();
  };
})();
