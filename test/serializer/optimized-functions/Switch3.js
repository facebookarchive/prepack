let x = global.__abstract ? __abstract("number", "1") : 1;

function g(x) {
  switch (x) {
    case 0:
      return 12;
    case 1:
      return 24;
    default:
      return 42;
  }
}

global.__optimize && __optimize(g);

inspect = function() {
  return g(x);
};
