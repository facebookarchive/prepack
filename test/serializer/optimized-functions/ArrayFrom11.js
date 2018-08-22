function fn(x, y) {
  var a = Array.from(x);
  var b = Array.from(x);
  var c = y ? a : b;
  return c.length && c[0];
}

this.__optimize && __optimize(fn);

inspect = function() {
  return fn(["foo", 1, 2], true);
};
