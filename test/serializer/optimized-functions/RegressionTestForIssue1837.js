(function() {
  function fn1(x, y) {
    for (var i = 0; i < y.length; ++i) {
      if (x[y[i]]) {
        break;
      }
    }
  }

  function fn2(count) {
    if (count >= 0) {
      return ["1", "*"];
    } else {
      return ["2", "*"];
    }
  }

  function fn(props) {
    fn1({ "*": 1 }, fn2(props.foo));
  }

  global.__optimize && __optimize(fn);

  global.inspect = function() {
    return JSON.stringify([fn({ foo: -1 }), fn({ foo: 1 })]);
  };
})();
