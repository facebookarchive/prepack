(function() {
  function outer(cond) {
    if (cond) {
      var value = 42;
      function inner1() {
        return value;
      }
      function inner2() {
        return value;
      }
      global.__optimize && __optimize(inner1);
      global.__optimize && __optimize(inner2);
      return [inner1, inner2];
    }
  }
  global.outer = outer;
  global.__optimize && __optimize(outer);

  global.inspect = function() {
    let [i1, i2] = outer(true);
    return i1() + i2();
  };
})();
