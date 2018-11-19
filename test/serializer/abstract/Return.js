let x = global.__abstract ? __abstract("boolean", "true") : true;

let y = 1;

function f(b) {
  if (b) {
    y = 2;
    return 1;
  } else {
    y = 3;
    return 2;
  }
}

var z = f(x);
var z1 = y;

inspect = function() {
  return "" + z + z1;
};
