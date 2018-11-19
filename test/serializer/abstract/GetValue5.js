let x = global.__abstract ? __abstract("boolean", "true") : true;

let proto = { a: 1 };
let o = { a: 2 };
Object.setPrototypeOf(o, proto);

let ob = x ? o : { a: 3 };

delete ob.a;
var z = o.a;

inspect = function() {
  return z;
};
