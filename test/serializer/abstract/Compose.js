function bar(y) {
  if (y) {
    throw Error("Foo");
  }
  return null;
}

function fn(x, y) {
  if (x) {
    bar(y);
  }
  return 123;
}

if (global.__optimize) __optimize(fn);

inspect = function() {
  return fn(true, false);
};
