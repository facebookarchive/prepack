function fn(x) {
  var a = x || { b: 5 };

  return Object.assign({}, a, { b: 1 });
}

global.__optimize && __optimize(fn);

inspect = function() {
  return JSON.stringify({ x: fn(false), y: fn({ b: 10 }) });
};
