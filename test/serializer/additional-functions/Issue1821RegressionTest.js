// expected Warning: PP0023
(function() {
  function URI(other) {
    if (other) {
      throw new Error();
    }
    this.foo = other.noSuchMethod();
  }

  function fn(arg) {
    var first = new URI(arg);
    return function() {
      new URI(first);
    };
  }

  if (global.__optimize) __optimize(fn);

  global.fn = fn;
  inspect = function() {
    return 42;
  }; // just don't crash the serializer
})();
