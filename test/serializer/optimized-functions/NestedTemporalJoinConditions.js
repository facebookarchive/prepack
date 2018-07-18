function fn(str, start, length) {
  var size = str.length;
  var posA = 0;
  if (start > 0) {
    if (posA >= size) {
      return posA;
    }
  }
}

if (global.__optimize) __optimize(fn);

global.inspect = function() {
  return true;
};
