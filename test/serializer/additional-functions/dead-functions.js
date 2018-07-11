(function() {
  function g() {
    return 42;
  }
  function f() {
    return g();
  }
  if (global.__optimize) {
    __optimize(f);
    __optimize(g);
  }
  inspect = f;
})();
