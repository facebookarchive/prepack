// throws introspection error

let b = __abstract("boolean", "true");
ob = b ? { p: 1 } : { q: 2 };
z1 = Reflect.has(ob, "p");
