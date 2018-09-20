let x = global.__abstract ? __abstract("number", "5") : 5;

// throws introspection error
function g(max) {
  let counter = 0;
  for (let i = 0; i < max; i++) {
    switch (i) {
      case 0:
        counter++;
        break;
      case 1:
        counter += 2;
        break;
      case 2:
        counter += 3;
        break;
      case 3:
        continue;
      default:
        return counter;
    }
  }
}

global.__optimize && __optimize(g);

inspect = function() {
  return g(x);
};
