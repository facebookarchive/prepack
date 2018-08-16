if (!global.__evaluatePureFunction) global.__evaluatePureFunction = f => f();

const havoc = global.__abstract ? global.__abstract("function", "(() => {})") : () => {};

const result = global.__evaluatePureFunction(() => {
  let x = 23;
  function incrementX() {
    x = x + 42;
  }
  if (global.__optimize) __optimize(incrementX);
  havoc(incrementX);
  return x;
});

global.inspect = () => result;
