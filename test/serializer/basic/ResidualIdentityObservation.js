(function() {
  var a = { x: 4 };
  function f() {
    return a;
  }
  function g() {
    return a;
  }
  inspect = function() {
    return f() === g();
  };
})();
