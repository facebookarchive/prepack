// arrayNestedOptimizedFunctionsEnabled

function fn(x, obj, cond, cond2, cond3, cond4) {
  var arr = Array.from(x);
  var a;
  var b;
  var res;

  if (cond) {
    a = obj.a;
    if (cond2) {
      b = obj.b;
      if (cond3) {
        res = arr.map(function(item) {
          return cond4 ? a : b;
        });
      }
    }
  }
  return res;
}

global.__optimize && __optimize(fn);

global.inspect = function() {
  return true;
};
