// does not contain:1 + 2
(function() {
  function f() {
    function residual() {
      let z = 3;
      function g() {
        return 1 + 2 + z;
      }

      global.__optimize && __optimize(g);
      return g;
    }
    let g = residual();

    return g;
  }
  if (global.__optimize) __optimize(f);
  global.inspect = function() {
    return f()();
  };
})();
