function fn2(cond, items) {
  if (cond) {
    return items.length;
  }
  return 0;
}

function fn(cond, x, y) {
  var items = Array.from(x);
  var items2 = Array.from(y);

  var len = fn2(cond, items);
  var len2 = fn2(cond, items2);

  if (len > 0) {
    return len.toString();
  }
  if (len2 > 0) {
    return len.toString();
  }
  return "Should hit this!";
}

this.__optimize && __optimize(fn);

inspect = function() {
  return fn(false, [], []);
};
