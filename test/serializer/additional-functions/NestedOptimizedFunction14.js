// skip this test for now
// we don't know how to optimize the union of two different functions
(function() {
  function f(x, y, z) {
    var g;
    if (x)
      g = function() {
        return y;
      };
    else
      g = function() {
        return z;
      };
    if (global.__optimize) __optimize(g);
    return g;
  }
  if (global.__optimize) __optimize(f);
  global.inspect = function() {
    let y = f(true, 42, 23)();
    let z = f(false, 42, 23)();
    return y + "|" + z;
  };
})();
