// does not contain:Object.assign

function fn(abstract) {
  var a = Object.assign({}, { x: 1 }, abstract, { x: 25 });
  return a.x;
}

global.__optimize && __optimize(fn);

inspect = function() {
  return fn({ x: 2 });
};
