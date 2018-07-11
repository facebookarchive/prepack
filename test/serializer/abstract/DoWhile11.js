let n = global.__abstract ? __abstract("number", "(3)") : 3;
let i = 0;
let o = [];
do {
  o[i] = i;
  i++;
} while (i < n);

inspect = function() {
  return JSON.stringify(o);
};
