// throws introspection error
let x = global.__abstract ? __abstract("boolean", "true") : true;
let proto = {};
Object.defineProperty(proto, "p", { writable: false, configurable: true, value: 1 });
let ob1 = {};
Object.setPrototypeOf(ob1, proto);
let ob2 = {};
ob = x ? ob1 : ob2;
Object.defineProperty(ob, "p", { writable: true, value: 2 });
if (x) delete proto.p;
ob1.p = 3;
