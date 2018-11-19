var x = new Uint8Array([1, 2, 3]);
x.foo = "bar";

inspect = function() {
  return x.length + " " + x[0] + x[1] + x[2] + x[3] + x.foo;
};
