function F() {
  this.a = 1;
  this.b = 2;
  if (global.__abstract) return global.__abstract(undefined, "undefined");
}

const result = new F();

global.inspect = () => JSON.stringify(result);
