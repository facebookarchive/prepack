let a = global.__abstract ? __abstract([], "[1, 2, 3]") : [1, 2, 3];
let n = global.__abstract ? __abstract("number", "(3)") : 3;
let i = 0;
let b = [];
do {
  b[i] = a[i++];
} while (i < n);
let x = b[1];
let j = b.length;

inspect = function() {
  return i + " " + j + " " + x + " " + JSON.stringify(b);
};
