// throws introspection error

var c = global.__abstract ? __abstract("boolean", "(true)") : true;
var obj = { x: 1 };
if (c) delete obj.x;
Object.defineProperty(obj, "x", { value: 2 });
inspect = function() {
  return Object.getOwnPropertyDescriptor(obj, "x").enumerable;
};
