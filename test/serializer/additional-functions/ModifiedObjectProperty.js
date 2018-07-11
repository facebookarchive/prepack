// expected Warning: PP0023
(function() {
  let p = {};
  function f(c) {
    let o = {};
    if (c) {
      o.foo = 42;
      throw o;
    }
  }
  if (global.__optimize) __optimize(f);
  inspect = function() {
    try {
      f(true);
    } catch (o) {
      return o.foo;
    }
  };
})();
