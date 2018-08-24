var c = global.__abstract ? __abstract("boolean", "(true)") : true;
var obj = {};
Object.defineProperty(obj, "x", { value: 1, enumerable: true, writable: true, configurable: true });
if (c) delete obj.x;
Object.defineProperty(obj, "x", { enumerable: true, writable: true, configurable: false });

inspect = function() {
  return Object.getOwnPropertyDescriptor(obj, "x");
};
