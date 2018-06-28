// copies of 42:1

(function() {
  function f(g, c, d) {
    let o = { foo: 42 };
    if (c) {
      if (d) {
        g(o);
      } else {
        o.foo = 1;
      }
    } else {
      o.foo = 2;
    }

    return o;
  }

  global.__optimize && __optimize(f);
  inspect = function() {
    return JSON.stringify(f(o => o, false, false));
  };
})();
