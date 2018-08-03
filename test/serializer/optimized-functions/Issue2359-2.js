function fn(arr, abstractFunc) {
  var a = {};

  abstractFunc(function() {
    a = 1;
  });

  var z = a.x;

  var mapper = function(item) {
    return z;
  };

  __optimize(mapper);
  var res = arr.map(mapper);

  return res;
}

global.__optimize && __optimize(fn);

global.inspect = function() {
  return true;
};
