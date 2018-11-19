(function() {
  function f(x) {
    return new Date(x).getUTCDay();
  }

  global.__optimize && __optimize(f);

  global.inspect = function() {
    return f(1529579851072000);
  };
})();
