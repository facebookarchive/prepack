let x = global.__abstract ? __abstract("boolean", "true") : true;
let ob = x ? { a: 1 } : { a: 2 };
desc = Object.getOwnPropertyDescriptor(ob, "a");
Object.defineProperty(ob, "b", desc);
b = ob.b;
inspect = function() { return JSON.stringify(desc) + b; }
