// expected Warning: PP0023
(function() {
  function f(c) {
    let o = {};
    if (c) {
      o.foo = 42;
      return o;
    }
    throw o;
  }
  if (global.__optimize) __optimize(f);
  global.f = f;
  inspect = function() {
    try {
      f(false);
    } catch (o) {
      return o.foo;
    }
  };
})();
