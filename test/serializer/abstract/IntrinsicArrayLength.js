// omit invariants
// Copies of length:1
var arr = global.__abstract ? __abstract([], "[]") : [];
arr[0] = 1;
arr[1] = 2;

inspect = function() {
  return arr.length;
};
