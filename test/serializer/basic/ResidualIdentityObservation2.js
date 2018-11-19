(function() {
  var a = { x: 4 };
  function f() {
    return a;
  }
  inspect = function() {
    return f() === f();
  };
})();
