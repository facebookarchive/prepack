let x = global.__abstract ? __abstract("boolean", "true") : true;
let ob = x ? { a: 1 } : { a: 2 };
var desc = Object.getOwnPropertyDescriptor(ob, "a");
Object.defineProperty(ob, "b", desc);
var b = ob.b;
inspect = function() {
  return JSON.stringify(desc) + b;
};
