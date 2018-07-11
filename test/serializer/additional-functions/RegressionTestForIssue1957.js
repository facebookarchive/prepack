(function() {
  function f(c) {
    function g() {}
    g.magic = 23;
    if (c) {
      throw new g();
    }
    return 42;
  }
  if (global.__optimize) __optimize(f);
  global.f = f;
  inspect = function() {
    try {
      f(true);
    } catch (e) {
      return f(false) + "/" + e.constructor.magic;
    }
  };
})();
