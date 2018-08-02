(function() {
  function f(g, c) {
    let o = { foo: 42 };
    if (c) {
      g(o);
    } else {
      o.foo = 2;
    }

    return o;
  }

  global.__optimize && __optimize(f);
  inspect = function() {
    return JSON.stringify(f(o => o, false));
  };
})();
