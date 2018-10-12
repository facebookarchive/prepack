// arrayNestedOptimizedFunctionsEnabled

function fn(items, abstractFunc) {
  var a = 10;
  var b = function() {
    return a;
  };
  var arr = Array.from(items);

  function fn2() {
    abstractFunc(function() {
      return b;
    });
  }

  var mapped = arr.map(function() {
    return fn2();
  });

  b = function() {
    return 20;
  };

  return [b, mapped];
}

inspect = function() {
  var value;
  function mutateBinding(caller) {
    value = caller()();
  }
  fn([1, 2, 3], mutateBinding);
  return value;
};

global.__optimize && __optimize(fn);
