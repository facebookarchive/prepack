// arrayNestedOptimizedFunctionsEnabled

function fn(x, cond, abstractFunc) {
  var arr = Array.from(x);

  var a = {};

  if (cond) {
    abstractFunc(function() {
      a = 1;
    });

    var z = a.x;

    var res = arr.map(function() {
      return z;
    });
  }

  return res;
}

global.__optimize && __optimize(fn);

global.inspect = function() {
  return fn([1, 2], true, function(argF) {
    argF();
  });
};
