function fn(x, counter) {
  var i = 0;
  for (; i !== x; ) {
    counter.x++;
    i++;
    var val1 = counter.x,
      val2 = val1 + 1;
  }
  return val2;
}

global.__optimize && __optimize(fn);

inspect = function() {
  return fn(100, { x: 2 });
};
