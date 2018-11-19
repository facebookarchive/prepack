let x = global.__abstract ? __abstract("boolean", "true") : true;

var y = 1;

function f(b) {
  if (b) throw 1;
  y = 2;
}

var z = f(!x);

inspect = function() {
  return z;
};
