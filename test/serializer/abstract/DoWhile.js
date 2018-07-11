let n = global.__abstract ? __abstract("number", "10") : 10;
let i = 0;
let j;
do {
  i++;
  j = 0;
} while (i < n);

inspect = function() {
  return i + " " + j;
};
