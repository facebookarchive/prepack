// throws introspection error
let x = __makePartial({ p: 1 }, "({p: 1})");
z = Object.getOwnPropertyDescriptor(x, "q");
console.log(z);
