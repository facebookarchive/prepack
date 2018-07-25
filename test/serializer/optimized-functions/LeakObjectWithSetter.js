(function() {
  function f(g) {
    let o = {
      foo: 1,
      set x(v) {
        this.foo += 1;
      },
    };
    g(o);
    return o;
  }

  global.__optimize && __optimize(f);
  inspect = () => {
    JSON.stringify(f(o => o));
  };
})();
