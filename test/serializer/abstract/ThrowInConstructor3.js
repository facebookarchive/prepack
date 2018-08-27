function F() {
  const b1 = global.__abstract ? global.__abstract("boolean", "false") : false;
  const b2 = global.__abstract ? global.__abstract("boolean", "true") : true;
  if (b1) throw new Error("abrupt");
  return b2 ? { p: 42 } : 42;
}

const result = new F();

global.inspect = () => JSON.stringify(result);
