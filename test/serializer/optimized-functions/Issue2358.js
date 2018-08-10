// arrayNestedOptimizedFunctionsEnabled

function fn(x, y, obj, cond) {
  var arr = Array.from(x);
  var arr2 = Array.from(y);

  var a = obj.a;

  var res = arr.map(function(item) {
    if (cond) {
      return a;
    }
  });

  var res2 = arr2.map(function(item) {
    if (cond) {
      return a;
    }
  });

  return [res, res2];
}

global.__optimize && __optimize(fn);

global.inspect = function() {
  return JSON.stringify(fn([1, 2], [3, 4], { a: 5 }, true));
};
