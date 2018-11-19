let x = global.__abstract ? __abstract("boolean", "true") : true;

var y = 1;

function f(b) {
  if (b) {
  } else return 1;
  y = 2;
}

var z = f(x);
var z1 = y;
var z2 = f(!x);
var z3 = y;

inspect = function() {
  return "" + z + z1 + z2 + z3;
};
