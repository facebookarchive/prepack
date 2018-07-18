(function() {
  function fn(arg) {
    if (arg.foo) {
      return "a";
    }
    if (arg.bar === 0) {
      return "b";
    }
    return Object.assign(
      {
        qux: function() {
          arg.qux();
        },
      },
      arg.baz()
    );
  }

  if (global.__optimize) {
    __optimize(fn);
  }

  global.inspect = function() {
    return JSON.stringify([
      fn({ foo: 1 }),
      fn({ bar: 0 }),
      fn({ foo: 1, bar: 0 }),
      fn({
        baz: function() {
          return { a: 42 };
        },
      }),
    ]);
  };
})();
