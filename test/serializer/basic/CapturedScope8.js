(function() {
  let f = function(x) {
    return function() {
      for (let i = 0; i < 100; i++) x++;
      return x;
    };
  };
  global.g = [f(2), f(6)];
  inspect = function() {
    global.g[0]();
    return global.g[1]();
  };
})();
