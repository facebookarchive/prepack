function fn(x, total, val) {
  var replaced;
  let wholeNumber = val.toString();
  if (x === true) {
    for (var i = 0; i < total; i++) {
      wholeNumber++;
    }
  }
  return wholeNumber;
}

global.__optimize && __optimize(fn);

inspect = function() {
  return fn(false, 10, 5);
};
