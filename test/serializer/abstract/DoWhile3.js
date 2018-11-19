let n = global.__abstract ? __abstract("number", "10") : 10;
let i = 0;
do {
  i++;
  break;
} while (i < n);
xyz: do {
  i++;
  break xyz;
} while (i < n);
do {
  5;
} while (false);
do {} while (false);
do {
  i++;
} while (i < 12);

inspect = function() {
  return i;
};
