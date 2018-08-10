function fn(x, y, obj, cond) {
  var arr = x;
  var arr2 = y;

  var a = obj.a;

  var mapper1 = function(item) {
    if (cond) {
      return a;
    }
  };
  global.__optimize && __optimize(mapper1);
  var res = arr.map(mapper1);

  var mapper2 = function(item) {
    if (cond) {
      return a;
    }
  };
  global.__optimize && __optimize(mapper2);
  var res2 = arr2.map(mapper2);

  return [res, res2];
}

global.__optimize && __optimize(fn);

global.inspect = function() {
  return JSON.stringify(fn([1, 2], [3, 4], { a: 5 }, true));
};
