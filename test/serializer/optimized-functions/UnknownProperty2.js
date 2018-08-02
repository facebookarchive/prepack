var cache = {};
function f(x, y) {
  cache[x] = y;
  cache[x + 1] = y * 2;
}
if (global.__optimize) __optimize(f);

inspect = function() {
  f(42, 5);
  return cache[42] + " " + cache[43];
};
