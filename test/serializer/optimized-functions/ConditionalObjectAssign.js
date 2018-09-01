function fn(x) {
  var a = x ? { a: 1 } : { a: 2 };

  return Object.assign({}, a, { b: 1 });
}

global.__optimize && __optimize(fn);

inspect = function() {
  return JSON.stringify({ x: fn(false), y: fn(true) });
};
