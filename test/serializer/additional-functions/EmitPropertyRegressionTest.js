// expected Warning: PP0023
(function() {
  function URI(other) {
    if (other.foo) {
      setBarFrom(this, other.bar);
      serialize(other.foo);
      return true;
    }
    this.foo = other.noSuchMethod() || {};
    return true;
  }

  function setBarFrom(uri, bar) {
    if (!bar.something) {
      throw new Error("no");
    }
    uri.bar = bar;
    return uri;
  }

  function serialize(obj) {
    for (var k in obj) {
    }
  }

  function fn(arg) {
    var first = new URI(arg);
    if (arg) {
      new URI(first);
    }
  }

  if (global.__optimize) __optimize(fn);

  global.fn = fn;

  inspect = function() {
    return true;
  }; // just make sure Prepack doesn't crash while generating code
})();
