function fn(x, counter) {
  var i = 0;
  var val2 = undefined;
  for (; i !== x; ) {
    counter.x++;
    i++;
    val2 = i;
  }
  return val2;
}

global.__optimize && __optimize(fn);

inspect = function() {
  return fn(100, { x: 2 });
};
