(function() {
  function f(c, d, g) {
    let o = { foo: 42 };
    if (c) {
      if (d) {
        o.foo = Date.now();
      } else {
        delete o.foo;
      }
      return g(function() {
        return "foo" in o;
      });
    }
  }
  global.__optimize && __optimize(f);
  global.inspect = function() {
    return f(true, false, h => h());
  };
})();
