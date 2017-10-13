let x = global.__abstract ? __abstract("boolean", "true") : true

y = 1;

function f(b) {
  if (b) throw 1;
  y = 2;
}

function g(b) {
  f(b);
}

z = g(x);

inspect = function() { return z; }
