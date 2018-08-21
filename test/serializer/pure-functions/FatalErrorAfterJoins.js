if (!global.__evaluatePureFunction) global.__evaluatePureFunction = f => f();

global.__evaluatePureFunction(() => {
  let x, y;

  function f() {
    const getNumber = global.__abstract ? global.__abstract("function", "(() => 1)") : () => 1;
    const b1 = global.__abstract ? global.__abstract("boolean", "true") : true;
    const b2 = global.__abstract ? global.__abstract("boolean", "!false") : true;

    x = getNumber();
    if (!b1) throw new Error("abrupt");
    y = getNumber();
    if (!b2) throw new Error("abrupt");
    if (global.__fatal) global.__fatal();
    return x + y;
  }

  f();
});
