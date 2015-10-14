// throws introspection error
let x = __abstract({p: 1}, "({p: 1})");
z = Object.getOwnPropertyDescriptor(x, "q");
console.log(z);
