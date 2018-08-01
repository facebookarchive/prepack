let x = global.__abstract ? __abstract("number", "1") : 1;
let c = global.__abstract ? __abstract("boolean", "true") : true;

// expected FatalError: PP0027
function f(x) {
  switch (x) {
    default:
      return 42;
  }
}

global.__optimize && __optimize(f);

// expected FatalError: PP0027
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

// expected FatalError: PP0027
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
  return JSON.stringify([f(x), g(x), h(x, c)]);
};
