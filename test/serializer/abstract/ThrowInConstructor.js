function F() {
  const b = global.__abstract ? global.__abstract("boolean", "false") : false;
  if (b) throw new Error("abrupt");
  return { p: 42 };
}

const result = new F();

global.inspect = () => JSON.stringify(result);
