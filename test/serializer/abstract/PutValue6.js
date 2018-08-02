// throws introspection error
let x = __abstract("boolean", "true");

let obj = { set x(v) {} };

o = x ? obj : { x: 456 };

o.x = 42;
