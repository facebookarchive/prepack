// does not contain:"0"
// omit invariants
(function() {
  function f(x) {
    return x[0];
  }
  global.__optimize && __optimize(f);
  global.inspect = function() {
    return f([42]);
  };
})();
