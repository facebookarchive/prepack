function fn(x, y, z) {
  var a = x ? y : z || { a: 2 };

  return Object.assign({}, a, { b: 1 });
}

global.__optimize && __optimize(fn);

inspect = function() {
  return JSON.stringify({ x: fn(false, { a: 1 }, true), y: fn(true, { a: 1 }, false) });
};
