// arrayNestedOptimizedFunctionsEnabled

function fn2() {
  var x = function() {
    return 123;
  };

  return function() {
    return x;
  };
}

function fn(x) {
  var arr = Array.from(x);
  return arr.map(function() {
    if (x) {
      return fn2();
    } else {
      return null;
    }
  });
}

inspect = function() {
  return fn([1])();
};

global.__optimize && __optimize(fn);
