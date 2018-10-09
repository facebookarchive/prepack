// arrayNestedOptimizedFunctionsEnabled
// Copies of return 2:0

function fn(a) {
  var arr = Array.from(a);
  var foo;
  
  var mapped = arr.map(function() {
    foo = 2;
    return 1 + 1;
  });

  return mapped;
}

inspect = function() {
  return fn([]);
}

global.__optimize && __optimize(fn);