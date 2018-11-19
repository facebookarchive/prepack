let n = global.__abstract ? __abstract("number", "10") : 10;
let i = 0;
let ob = {};
do {
  i++;
  ob[i] = 1;
} while (i < n);
let x = ob[5];

inspect = function() {
  return i + " " + x + " " + JSON.stringify(ob);
};
