(function() {
  var someAbstract = global.__abstract ? __abstract("function", "(function() {})") : () => {};
  var evaluatePureFunction = global.__evaluatePureFunction || (f => f());

  var result;
  evaluatePureFunction(() => {
    function calculate(y) {
      var z = { c: 3, e: 1 };
      if (global.__makePartial) __makePartial(z);
      if (global.__makeSimple) __makeSimple(z);
      someAbstract(z);

      var x = { a: 1, b: 1, c: 1 };
      return Object.assign(x, y, z);
    }
    result = calculate({ b: 2, d: 1 });
  });

  global.inspect = function() {
    return JSON.stringify(result);
  };
})();
