// throws introspection error
let x = __abstract("boolean", "true");

let target = { x: 1 };
let receiver = {};

Object.defineProperty(receiver, "x", { configurable: true, get: () => 2, set: v => void v });

receiver.x = 3;

Object.defineProperty(receiver, "x", { configurable: true, get: () => 2 });

receiver.x = 4;

Reflect.set(target, "x", 42, receiver);

let o = x ? receiver : {};
delete o.x;

Reflect.set(target, "x", 42, receiver);
