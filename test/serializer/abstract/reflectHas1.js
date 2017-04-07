// throws introspection error

let ob = __abstract({p: 1}, "({p: 1})")
z = Reflect.has(ob, "q");
