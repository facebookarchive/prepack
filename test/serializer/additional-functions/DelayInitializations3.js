(function() {
  function f() {
    let a = global.__abstract ? __abstract(undefined, "(42)") : 42;
    function nested() {
      return a;
    }
    return nested;
  }
  global.__optimize && __optimize(f);
  inspect = function() {
    return "" + f()() + "/" + f()();
  };
})();
