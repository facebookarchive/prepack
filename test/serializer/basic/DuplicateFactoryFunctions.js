(function() {
  function f() {
    return function() {
      // This is too big to be inlined, really. Way too big.
      // This is too big to be inlined, really. Way too big.
      return 1 + 3;
    };
  }
  function g() {
    return function() {
      return f();
    };
  }
  let gs = [g(), g(), g(), g()];
  for (let g of gs) if (global.__optimize) __optimize(g);
  global.gs = gs;
  global.f = f;
  global.inspect = function() {
    return global.f()();
  };
})();
