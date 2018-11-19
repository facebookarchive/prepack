// throws introspection error
let n = global.__abstract ? __abstract("number", "10") : 10;
let o = {};
let i = 0;
do {
  i++;
  if (i > 5) throw "oopsie";
} while (i < n);

inspect = function() {
  return i;
};
