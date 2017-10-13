let x = global.__abstract ? __abstract("boolean", "true") : true;

y = 1;
y1 = 2;

function f(b) {
  y = 2;
  if (b) return 0;
  y1 = 3;
  if (x) {
    return 1;
  } else {
    throw 2;
  }
}

z = f(!x);

inspect = function() { return z; }
