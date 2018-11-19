// throws introspection error
let x = __abstract("boolean", "true");
let ob1 = [];
Object.defineProperty(ob1, "length", { writable: false, value: 0 });
let ob2 = [];
let ob = x ? ob1 : ob2;
Object.defineProperty(ob, "0", { value: 1 });
