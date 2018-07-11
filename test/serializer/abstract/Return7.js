let c = 0;
let overflow = false;
function check1() {
  return global.__abstract ? global.__abstract("boolean", "/* check1 */ true") : true;
}
function check2() {
  return global.__abstract ? global.__abstract("boolean", "/* check2 */ true") : true;
}
function call1() {
  if (check1()) {
    c = c + 1;
    if (c > 2) {
      overflow = true;
      return 3;
    }
  }
  return 4;
}
function call2() {
  if (check2()) {
    c = c + 1;
    if (c > 2) {
      overflow = true;
      return 3;
    }
  }
  return 4;
}
a = call1();
b = call2();
inspect = function() {
  return overflow;
};
