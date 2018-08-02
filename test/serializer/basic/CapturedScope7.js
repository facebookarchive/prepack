(function() {
  function f() {
    let a = 1;
    let b = 2;
    return [
      function() {
        return a++; /* This comment makes this function too big to be inlined. */
      },
      function() {
        return b++; /* This comment makes this function too big to be inlined. */
      },
    ];
  }
  var F = f();
  inspect = function() {
    F[0]();
    return F[1]();
  };
})();
