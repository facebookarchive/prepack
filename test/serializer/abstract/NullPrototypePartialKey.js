let s = global.__abstract ? __abstract("string", "('foo')") : "foo";

let x = Object.create(null);
x.a = 1;
x.b = 2;

let y = x[s];

inspect = function() {
  return y;
};
