let x = global.__abstract ? __abstract("boolean", "true") : true;

var y = 1;

function f(b) {
  if (b) {
  } else return 1;
  y = 2;
  return 2;
}

var z = f(!x);

inspect = function() {
  return "" + y + z;
};
