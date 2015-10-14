// throws introspection error
let x = __abstract("boolean", "true");
let ob = x ? { a: 1 } : { b: 2 };
let desc = Object.getOwnPropertyDescriptor(ob, "a");
