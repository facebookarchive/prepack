// throws introspection error
let n = global.__abstract ? __abstract("number", "10") : 10;
let i = 0;
do {
  i++;
  if (i > 5) break;
} while (i < n);

inspect = function() {
  return i;
};
