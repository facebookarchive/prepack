(function() {
  function f() {
    let obj = { p: 42 };
    function g() {
      return obj.p;
    }
    function h() {
      return obj.p;
    }
    if (global.__optimize) {
      __optimize(g);
      __optimize(h);
    }
    return [g, h];
  }
  global.__optimize && __optimize(f);
  global.f = f;

  global.inspect = function() {
    let [g, h] = f();
    return g() + h();
  };
})();
