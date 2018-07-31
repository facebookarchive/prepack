(function() {
  function f(g) {
    let x = 23;
    function incrementX() {
      x = x + 42;
    }
    global.__optimize && __optimize(incrementX);

    g(incrementX);
    return x;
  }
  global.__optimize && __optimize(f);
  global.inspect = function() {
    return f(g => g());
  };
})();
