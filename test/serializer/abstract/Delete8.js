// throws introspection error
let x = global.__abstract ? __abstract("boolean", "true") : true;

let proto = { x: 111 };
let ob1 = {};
Object.defineProperty(ob1, "x", { writable: false, configurable: true, value: 123 });
Object.setPrototypeOf(ob1, proto);
let ob2 = { y: 456 };
let o = x ? ob1 : ob2;

delete o.x;
ob1.x = 789;
