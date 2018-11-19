// expected Warning: PP1007

(function() {
  let outer = {};
  function f(x) {
    outer.x = x;
  }
  if (global.__optimize) __optimize(f);
  global.f = f;
  inspect = function() {
    return true;
  };
})();
