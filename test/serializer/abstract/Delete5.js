// throws introspection error
let x = __abstract("boolean", "true");

let ob1 = { x: 123 };
let ob2 = {};
Object.defineProperty(ob2, "x", { writable: false, value: 456 });
let o = x ? ob1 : ob2;

delete o.x;
