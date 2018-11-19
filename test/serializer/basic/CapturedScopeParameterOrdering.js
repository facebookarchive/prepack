(function() {
  function f() {
    let x = 0;
    function g() {
      return function(p) {
        return [p, x++]; /* This comment makes this function too big for inlining */
      };
    }
    return [g(), g(), g()];
  }
  let a = f();
  inspect = function() {
    return a[0](42)[0];
  };
})();
