let n = global.__abstract ? __abstract("number", "10") : 10;
let i = 0;
let j;
let k = 10;
do {
  i++;
  if (i > 1) {
    j = 2;
    k = i + 3;
  }
} while (i < n);

inspect = function() {
  return i + " " + j + " " + k;
};
