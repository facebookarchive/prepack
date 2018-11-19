// expected Warning: PP1007
// add at runtime:var a = 17;
// Copies of \|\|:2
(function() {
  let a, b, c, d;
  global.f = function() {
    a = 1;
    b = 2;
    c = 3;
    d = 4;
  };
  if (global.__optimize) __optimize(f);
  inspect = function() {
    global.f();
    return a + b + c + d;
  };
})();
