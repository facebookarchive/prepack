let n = global.__abstract ? __abstract("number", "10") : 10;
let i = 0;
let j;
let k;
do {
  j = i;
  i++;
  k = i + 2;
} while (i < n);

inspect = function() {
  return i + " " + j + " " + k;
};
