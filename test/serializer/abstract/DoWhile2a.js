// does not contain:inspect
let n = global.__abstract ? __abstract("number", "10") : 10;
let o = {};
let i = 0;
do {
  i++;
  throw "oopsie";
} while (i < n);

inspect = function() {
  return i;
};
