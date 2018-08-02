let x = global.__abstract ? __abstract("number", "1") : 1;

// throws introspection error
function f(x) {
  switch (x) {
    case 0:
      throw 12;
    case 1:
      throw 24;
    default:
      throw 42;
  }
}

global.__optimize && __optimize(f);

inspect = function() {
  return f(x);
};
