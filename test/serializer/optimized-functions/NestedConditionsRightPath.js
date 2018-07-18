(function() {
  function fn(arg) {
    if (arg.foo()) {
      if (arg.bar()) {
        return 1;
      }
    } else {
      return 2;
    }
  }

  if (global.__optimize) {
    __optimize(fn);
  }

  global.inspect = function() {
    let count = 0;
    fn({ foo: () => (count++, false), bar: () => (count++, true) });
    return count;
  };
})();
