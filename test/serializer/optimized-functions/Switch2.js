let x = global.__abstract ? __abstract("number", "1") : 1;

// throws introspection error
function f(x) {
  switch (x) {
    default:
      return 42;
  }
}

global.__optimize && __optimize(f);

inspect = function() {
  return f(x);
};
