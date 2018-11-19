let n = global.__abstract ? __abstract("number", "10") : 10;
let i = 0;
let ob = { j: 0 };
do {
  i++;
  ob.j = i;
} while (ob.j < n);

inspect = function() {
  return i + " " + ob.j;
};
