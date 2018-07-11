function fn(x, counter) {
  var i = 0;
  for (; i !== x; ) {
    counter.x++;
    i++;
    var val = counter.x;
  }
  return val;
}

global.__optimize && __optimize(fn);

inspect = function() {
  return fn(100, { x: 2 });
};
