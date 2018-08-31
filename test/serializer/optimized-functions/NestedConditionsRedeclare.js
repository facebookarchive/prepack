(function() {
  function fn(arg) {
    if (arg.foo()) {
      if (arg.bar()) {
        return 42;
      }
    }
  }

  if (global.__optimize) {
    __optimize(fn);
  }

  global.inspect = function() {
    let count = 0;
    fn({ foo: () => (count++, true), bar: () => (count++, true) });
    return count;
  };
})();
