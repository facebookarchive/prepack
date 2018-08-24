if (!global.__evaluatePureFunction) global.__evaluatePureFunction = f => f();

const result = global.__evaluatePureFunction(() => {
  let x, y, z;

  function f() {
    const getNumber = global.__abstract ? global.__abstract("function", "(() => 1)") : () => 1;
    const b1 = global.__abstract ? global.__abstract("boolean", "true") : true;
    const b2 = global.__abstract ? global.__abstract("boolean", "!false") : true;
    const b3 = global.__abstract ? global.__abstract("boolean", "!!true") : true;

    x = getNumber();
    if (!b1) throw new Error("abrupt");
    y = getNumber();
    if (!b2) throw new Error("abrupt");
    z = getNumber();
    if (!b3) throw new Error("abrupt");

    if (global.__fatal) global.__fatal();

    return x + y + z;
  }

  f();

  return x + y + z;
});

global.inspect = () => result;
