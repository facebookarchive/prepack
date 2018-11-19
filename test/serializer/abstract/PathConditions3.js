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
      } else {
        throw 600;
      }
    }
  }
}

try {
  var x = f1();
} catch (e) {
  x = e;
}

inspect = function() {
  return x;
};
