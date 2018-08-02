// add at runtime:var a = 17;
// Count of 42:1
(function() {
  let a = global.__abstract ? __abstract("number", "a") : 17;
  let b, c, d;
  global.f = function() {
    b = a + 42;
    c = a + 42;
    d = a + 42;
  };
  if (global.__optimize) __optimize(f);
  inspect = function() {
    global.f();
    return b + c + d;
  };
})();
