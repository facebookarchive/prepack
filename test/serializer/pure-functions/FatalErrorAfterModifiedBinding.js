if (!global.__evaluatePureFunction) global.__evaluatePureFunction = f => f();

const result = global.__evaluatePureFunction(() => {
  let x;

  function f() {
    const getNumber = global.__abstract ? global.__abstract("function", "(() => 1)") : () => 1;
    const b1 = global.__abstract ? global.__abstract("boolean", "true") : true;

    x = getNumber();
    if (!b1) throw new Error("abrupt");
    if (global.__fatal) global.__fatal();
  }

  f();

  return x;
});

global.inspect = () => result;
