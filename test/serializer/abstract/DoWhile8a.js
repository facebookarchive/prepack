let a = global.__abstract ? __makeSimple(__abstract("array", "[1, 2, 3]")) : [1, 2, 3];
let i = 0;
let b = [];
do {
  b[i] = a[i++];
} while (i < a.length);
let x = b[1];
let j = b.length;

inspect = function() {
  return i + " " + j + " " + x + " " + JSON.stringify(b);
};
