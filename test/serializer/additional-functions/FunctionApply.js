function inner(a, b, c) {
  return {
    a,
    b,
    c,
  };
}

function fn(arg) {
  var x = Array.from(arg).map(x => x);
  return inner.apply(null, x);
}

if (global.__optimize) __optimize(fn);

inspect = function() {
  return JSON.stringify([fn([1, 2, 3]), fn([4, 5, 6])]);
};
