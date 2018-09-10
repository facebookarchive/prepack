(function() {
  function f() {
    let obj = { p: 42 };
    function g() {
      function h() {
        return obj.p;
      }
      global.__optimize && __optimize(h);
      return h;
    }
    if (global.__optimize) __optimize(g);
    return g;
  }
  global.__optimize && __optimize(f);
  global.f = f;

  global.inspect = function() {
    let g = f();
    return g()();
  };
})();
