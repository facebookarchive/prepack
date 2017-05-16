let c = 0;
let overflow = false;
function check() {
  return global.__abstract ? __abstract('boolean', 'true') : true;
}
function call() {
  if (check()) {
    c = c + 1;
    if (c > 2) {
      overflow = true;
      return 3;
    }
  }
  return 4;
}
a = call();
b = call();
inspect = function() {
  return overflow;
};
