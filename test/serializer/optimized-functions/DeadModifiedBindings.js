// does not contain:reachMe
(function() {
  var x;
  function g() {
    x = { canYou: "reachMe?" };
  }
  function f() {
    g();
    return 42;
  }
  if (global.__optimize) __optimize(f);
  global.inspect = f;
})();
