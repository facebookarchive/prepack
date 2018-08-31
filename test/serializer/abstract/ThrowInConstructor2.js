function F() {
  const b = global.__abstract ? global.__abstract("boolean", "true") : true;
  return b ? { p: 42 } : 42;
}

const result = new F();

global.inspect = () => JSON.stringify(result);
