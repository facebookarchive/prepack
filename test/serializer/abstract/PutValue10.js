// throws introspection error
let x = __abstract("boolean", "true");

let target = { x: 1 };
let receiver = {};
Object.defineProperty(receiver, "x", { writable: false, configurable: true, value: 2 });

Reflect.set(target, "x", 42, receiver);

let o = x ? receiver : {};
delete o.x;

Reflect.set(target, "x", 42, receiver);
