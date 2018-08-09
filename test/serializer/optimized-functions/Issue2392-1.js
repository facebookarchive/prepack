// arrayNestedOptimizedFunctionsEnabled

function fn(x, obj, cond, cond4) {
  var arr = Array.from(x);

  var f = function(item) {
    return cond4 ? a : 5;
  };
  if (cond) {
    var a = obj.a;
    return arr.map(f);
  }
}

global.__optimize && __optimize(fn);

global.inspect = function() {
  return true;
};
