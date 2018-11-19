var x = global.__abstract ? (x = __abstract("number", "(2)")) : 2;
let i;
let j = 100;

label: for (i = 0; i < 3; i++) {
  if (i == x - 1) continue label;
  if (i === x) continue;
  j += 100;
}

inspect = function() {
  return j;
};
