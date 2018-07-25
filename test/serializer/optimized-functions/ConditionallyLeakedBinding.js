(function() {
  function f(c, g) {
    let x = 23;
    let y = 0;
    if (c) {
      x = Date.now();
      function h() {
        y = x;
        x++;
      }
      g(h);
      return x - y;
    } else {
      x = Date.now();
      return x - y;
    }
  }
  global.__optimize && __optimize(f);
  global.inspect = function() {
    return f(true, g => g());
  };
})();
