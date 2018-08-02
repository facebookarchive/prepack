(function() {
  function f() {
    let a = global.__abstract ? __abstract(undefined, "(42)") : 42;
    function nested() {
      return a;
    }
    return nested;
  }
  function g() {
    let a = global.__abstract ? __abstract(undefined, "(23)") : 23;
    function nested() {
      return a;
    }
    return nested;
  }
  let ff = f();
  let gg = g();
  inspect = function() {
    return ff() + gg();
  };
})();
