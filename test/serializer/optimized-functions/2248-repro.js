function fn(str, start) {
  var size = str.length;
  var posA = 0;
  if (start > 0) {
    for (; start > 0 && posA < size; start--) {
      posA += 1 + str.charCodeAt(posA);
    }
    if (posA >= size) {
      return posA;
    }
  }
}

if (global.__optimize) __optimize(fn);

global.inspect = function() {
  let res1 = fn("abcdef", 1);
  return res1;
};
