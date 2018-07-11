(function() {
  function f(c, g) {
    let obj = {};
    Object.defineProperty(obj, "x", { writable: true, configurable: true, enumerable: false, value: 42 });
    function h() {
      return Object.getPropertyDescriptor(obj, "x").enumerable;
    }
    return g(h);
  }
  global.__optimize && __optimize(f);
  global.inspect = function() {
    return f(g => g());
  };
})();
