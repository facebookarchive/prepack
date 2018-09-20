// arrayNestedOptimizedFunctionsEnabled

function fn(x, y) {
  var edges = Array.from(x);
  var items = edges
    .map(function(a) {
      return a;
    })
    .filter(Boolean);

  var result = !y ? [] : items.slice(y.startIndex, y.startIndex + y.length);

  result.reverse();

  return result;
}

this.__optimize && __optimize(fn);

inspect = function() {
  return JSON.stringify(fn([1, 2, 3], { startIndex: 0, length: 3 }));
};
