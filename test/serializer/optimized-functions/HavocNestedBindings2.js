(function() {
  function f(g) {
    function definesX() {
      let x = 23;
      function incrementX() {
        x = x + 42;
      }

      global.__optimize && __optimize(incrementX);
      return [incrementX, x];
    }
    let [f1, x1] = definesX();
    g(f1);
    return x1;
  }
  global.__optimize && __optimize(f);
  global.inspect = function() {
    return f(g => g());
  };
})();
