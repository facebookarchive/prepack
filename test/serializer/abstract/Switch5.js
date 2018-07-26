let x = global.__abstract ? __abstract("number", "1") : 1;
let c = global.__abstract ? __abstract("boolean", "true") : true;

function f(x) {
  switch (x) {
    default: return 42;
  }
}

function g(x) {
  switch (x) {
    case 0: return 12;
    case 1: return 24;
    default: return 42;
  }
}

function h(x, c) {
  switch (x) {
    case 0: if (c) return 42; else return 99;
    case 1: return 23;
  }
}

inspect = function() {
  return ("" + f(x) + " " + g(x) + " " + h(x, c));
};
