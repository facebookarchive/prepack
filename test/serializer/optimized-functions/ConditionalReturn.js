(function() {
  function foo(x) {
    if (!x) {
      return null;
    }
    return x != null ? x : null;
  }

  global.__optimize && __optimize(foo);

  global.inspect = function() {
    return JSON.stringify([foo(null), foo(undefined), foo(0), foo(1), foo({})]);
  };
})();
