var a = String(global.__abstract ? __abstract("string", '"foo"') : "foo");
var b = String(global.__abstract ? __abstract("number", "42") : 42);
var c = String(global.__abstract ? __abstract("boolean", "true") : true);

inspect = function() {
  return JSON.stringify({ a, b, c });
};
