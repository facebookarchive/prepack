(function() {
  function f() {
    class foo {
      doSomething() {
        return 42;
      }
    }
    return foo;
  }
  if (global.__optimize) __optimize(f);
  inspect = function() {
    return new (f())().doSomething();
  };
})();
