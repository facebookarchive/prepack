// throws introspection error
let x = global.__abstract ? __abstract("boolean", "true") : true;

let proto = {};
Object.defineProperty(proto, "x", { writable: false, value: 111 });
let ob1 = { x: 123 };
Object.setPrototypeOf(ob1, proto);
let ob2 = { y: 456 };
let o = x ? ob1 : ob2;

delete o.x;
ob1.x = 789;
