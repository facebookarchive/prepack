// throws introspection error
let n = global.__abstract ? global.__abstract("number", "4") : 4;

function fibonacci(x) {
  return x <= 1 ? { valueOf: () => { throw "gotcha"; } } : fibonacci(x - 1) + fibonacci(x - 2);
}

let x;
try {
  x = fibonacci(n);
} catch (e) {
  x = "gotcha 2";
}

inspect = function() { return x; }
