// throws introspection error

let ob = global.__abstract ? __abstract({ x: 1 }, "({ x: 1 })") : { x: 1 };
if (global.__makeSimple) __makeSimple(ob);
function f() {}

let tgt = {};
for (var p in ob) {
  new f();
}

z = tgt;
