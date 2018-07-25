(function() {
  function f(g, c) {
    let o = { foo: 42 };
    if (c) {
      g(o);
    } else {
      o.x = 1;
    }

    return o;
  }

  global.__optimize && __optimize(f);
  inspect = function() {
    return JSON.stringify(f(o => o, false));
  };
})();
