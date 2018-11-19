let n = global.__abstract ? __abstract("number", "1") : 1;
let i = 0;
let ob = { j: 0 };
do {
  i++;
  if (i > 1) ob.j = i;
} while (i < n);

inspect = function() {
  return i + " " + ob.j;
};
