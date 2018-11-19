(function() {
  function f() {
    let obj = {};
    return function() {
      return obj;
    };
  }
  global.__optimize && __optimize(f);
  inspect = function() {
    return f()() === f()();
  };
})();
