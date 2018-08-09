(function() {
  function middle(cond) {
    if (cond) {
      var value = { x: 42 };
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
    let funcs = [].concat.apply([], outer(true));
    let objs = funcs.map(f => f());
    return " " + (objs[0] === objs[1]) + " " + (objs[1] === objs[2]);
  };
})();
