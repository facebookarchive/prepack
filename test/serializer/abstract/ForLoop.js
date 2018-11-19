var x = global.__abstract ? (x = __abstract("number", "(1)")) : 1;
let i;

for (i = 0; i < 2; i++) {
  if (i === x) break;
}

inspect = function() {
  return i;
};
