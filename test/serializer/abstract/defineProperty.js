// throws introspection error
let x = global.__abstract ? __abstract("object", "({p: 1})") : { p: 1 };
Object.defineProperty(x, "q", { enumerable: false, value: 2 });
