// skip this test for now
// throws introspection error
let n = global.__abstract ? global.__abstract("number", "4") : 4;

function fibonacci(x) {
  return x <= 1 ? x : fibonacci(x - 1) + fibonacci(x - 2);
}

let x = fibonacci(n);
let y = typeof x;

inspect = function() {
  return x + " " + y;
};
