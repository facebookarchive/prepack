var n = global.__abstract ? __abstract("number", "(2)") : 2;
let i = 0;
do {
  console.log(i++);
} while (i++ < n);

inspect = function() {
  return i;
};
