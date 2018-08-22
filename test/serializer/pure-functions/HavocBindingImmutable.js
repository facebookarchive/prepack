if (!global.__evaluatePureFunction) global.__evaluatePureFunction = f => f();

const havoc = global.__abstract ? global.__abstract("function", "(() => {})") : () => {};

const result = global.__evaluatePureFunction(() => {
  const b = global.__abstract ? global.__abstract("boolean", "true") : true;

  if (b) {
    var g = function f(i) {
      return i === 0 ? 0 : f(i - 1) + 1;
    };
    havoc(g);
  } else {
    return;
  }

  return g(5);
});

global.inspect = () => result;
