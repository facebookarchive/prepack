var cache = {};
function f(x, y) {
  cache[x] = y;
}
if (global.__optimize) __optimize(f);

inspect = function() {
  f(42, 5);
  return cache[42];
};
