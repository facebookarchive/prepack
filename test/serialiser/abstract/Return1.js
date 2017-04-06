let x = global.__abstract ? __abstract("boolean", "true") : true;

y = 1;

function f(b) {
  if (b) return 1;
  y = 2;
}

z = f(x);
z1 = y;
z2 = f(!x);
z3 = y;

inspect = function() { return "" + z + z1 + z2 + z3; }
