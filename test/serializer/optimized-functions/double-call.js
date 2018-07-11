function fn2(x, y) {
  return {
    val: x !== null ? y : undefined,
  };
}

function fn(x, y) {
  var x = fn2(x, y);
  var y = fn2(x, y);

  return [x, y];
}

global.__optimize && __optimize(fn);

inspect = function() {
  var x = JSON.stringify([fn(null, 1), fn(true, 2)]);
  return x;
};
