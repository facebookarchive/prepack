// copies of 42:1

(function() {
  function f(g, c) {
    let o = { foo: 42 };
    if (c) {
      g(o);
    } else {
      o.bar = 2;
    }

    return o;
  }

  global.__optimize && __optimize(f);
  inspect = function() {
    return JSON.stringify(f(o => o, false));
  };
})();
