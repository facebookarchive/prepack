// expected Warning: PP1007
// does not contain:dead
(function() {
  let b = { p: "dead" };
  global.f = function() {
    b = 42;
    return 23;
  };
  if (global.__optimize) __optimize(f);
  inspect = function() {
    return global.f();
  };
})();
