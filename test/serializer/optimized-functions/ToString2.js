function fn(cond, a, b) {
  var y;

  if (cond) {
    var x = global.__abstract ? __abstract("number", "a") : a;
    y = x.toString();
  } else {
    var x = global.__abstract ? __abstract("number", "b") : b;
    y = x.toString();
  }
  return y;
}

inspect = function() {
  return fn(true, 1, 2);
};

this.__optimize && __optimize(fn);
