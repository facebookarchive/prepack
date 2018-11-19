let x = global.__abstract ? __abstract("boolean", "true") : true;

var y = 1;
var y1 = 2;

function f(b) {
  y = 2;
  if (b) {
  } else return 0;
  y1 = 3;
  if (x) {
    return 1;
  } else {
    throw 2;
  }
}

var z = f(!x);

inspect = function() {
  return z;
};
