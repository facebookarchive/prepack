(function() {
  function middle(cond) {
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
  function outer(cond) {
    return [middle(cond), middle(cond)];
  }
  global.outer = outer;
  global.__optimize && __optimize(outer);

  global.inspect = function() {
    let [[i1, i2], [i3, i4]] = outer(true);
    return i1() + i2() + i3() + i4();
  };
})();
