let x = global.__abstract ? __abstract("number", "1") : 1;
let c = global.__abstract ? __abstract("boolean", "true") : true;

function h(x, c) {
  switch (x) {
    case 0:
      if (c) return 42;
      else return 99;
    case 1:
      return 23;
  }
}

global.__optimize && __optimize(h);

inspect = function() {
  return h(x, c);
};
