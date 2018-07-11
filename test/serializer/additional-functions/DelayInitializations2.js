(function() {
  function f(c) {
    let obj = c ? {} : undefined;
    return function() {
      return obj;
    };
  }
  global.__optimize && __optimize(f);
  inspect = function() {
    return f(true)() === f(true)();
  };
})();
