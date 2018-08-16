if (!global.__evaluatePureFunction) global.__evaluatePureFunction = f => f();

const result = global.__evaluatePureFunction(() => {
  const ks = [];

  const n = global.__abstract ? __abstract("number", "5") : 5;
  const o = { a: 1, b: 2, c: 3 };

  for (let i = 0; i < n; i++) {
    for (var k in o) {
      ks.push(k);
    }
    ks.push(k);
  }
  ks.push(k);

  return ks;
});

global.inspect = () => JSON.stringify(result);
