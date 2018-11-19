// does not contain: bind
(function() {
  function f() {
    return function() {
      /* This comment makes this function too big to be inlined */ return 42;
    };
  }

  var f1 = f();
  var f2 = f();
  inspect = function() {
    return f1() + f2();
  };
})();
