function fn(abstract) {
  var a = Object.assign({}, { x: 1 }, abstract);
  return a.x;
}

global.__optimize && __optimize(fn);

inspect = function() {
  return fn({ x: 2 });
};
