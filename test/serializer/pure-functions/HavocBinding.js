if (!global.__evaluatePureFunction) global.__evaluatePureFunction = f => f();

const x = global.__evaluatePureFunction(() => {
  const x = { p: 42 };

  const havoc = global.__abstract ? __abstract("function", "(() => {})") : () => {};
  havoc(() => x);

  return x;
});

global.inspect = () => {
  return JSON.stringify(x);
};
