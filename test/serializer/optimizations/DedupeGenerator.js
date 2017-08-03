// Copies of Date.now():1
(function() {
  function fib(x) {
    let y = Date.now();
    return x <= 1 ? x : fib(x - 1) + fib(x - 2);
  }

  let x = Date.now();
  if (x * 2 > 42) x = fib(10);
  global.result = x;
})();
