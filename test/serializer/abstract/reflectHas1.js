// throws introspection error

let ob = __makePartial({ p: 1 }, "({p: 1})");
z = Reflect.has(ob, "q");
