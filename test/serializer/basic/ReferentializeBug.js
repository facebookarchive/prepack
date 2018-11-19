(function() {
  function f() {
    let obj = { x: 0 };
    function g() {
      return function() {
        obj = { x: obj.x + 1 }; /* This comment makes this function too big to be inlined. */
      };
    }
    function h() {
      return obj.x;
    }
    return [g(), g(), g(), h];
  }
  var a = f();
  inspect = function() {
    return a[3]();
  };
})();
