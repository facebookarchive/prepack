// arrayNestedOptimizedFunctionsEnabled

function fn(items, abstractFunc) {
  var a = 10;
  var arr = Array.from(items);

  function fn2() {
    abstractFunc(function() {
      return a;
    });
  }

  var mapped = arr.map(function() {
    return fn2();
  });

  a = 11;

  return [a, mapped];
}

inspect = function() {
  var value;
  function mutateBinding(caller) {
    value = caller();
  }
  fn([1, 2, 3], mutateBinding);
  return value;
};

global.__optimize && __optimize(fn);
