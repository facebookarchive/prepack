// does not contain:1 + 2
(function() {
  function g() {
    return 1 + 2;
  }
  if (global.__optimize && __abstract("boolean", "true")) __optimize(g);
  global.inspect = function() {
    return g();
  };
})();
