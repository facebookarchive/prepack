let n1 = global.__abstract ? __abstract("number", "1") : 1;

function f1() {
  if (n1 > 10) {
    if (n1 > 20) {
      throw 100;
    } else {
      return 200;
    }
  } else {
    if (n1 > 3) {
      if (n1 > 4) {
        throw 300;
      } else {
        return 400;
      }
    } else {
      if (n1 > 2) {
        return 500;
      }
    }
  }
}

var x = f1();

inspect = function() {
  return x;
};
