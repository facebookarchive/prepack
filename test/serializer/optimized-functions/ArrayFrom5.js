function fn(x, y) {
  var foo = Array.from(x);

  return foo[y] + 5;
}

if (global.__optimize) __optimize(fn);

inspect = function() {
  return JSON.stringify([10], 0);
};
