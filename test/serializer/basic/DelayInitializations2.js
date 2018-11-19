(function() {
  let a = global.__abstract ? __abstract(undefined, "(42)") : 42;
  function f() {
    return a++;
  }
  global.inspect = function() {
    f() + f();
  };
})();
