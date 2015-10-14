let x = global.__abstract ? __abstract("boolean", "true") : true;

function f(b) {
  if (b) return 1; else return 2;
}

z = f(x);

inspect = function() { return "" + z; }
