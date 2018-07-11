function fn(x, counter) {
  var i = 0;
  for (; i !== x; ) {
    counter.x++;
    i++;
  }
  return counter.x;
}

global.__optimize && __optimize(fn);

inspect = function() {
  return fn(100, { x: 2 });
};
