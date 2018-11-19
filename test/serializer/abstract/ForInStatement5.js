// throws introspection error

let ob = global.__abstract ? __abstract({ x: 1 }, "({ x: 1 })") : { x: 1 };
if (global.__makeSimple) __makeSimple(ob);

let tgt = {};
for (var p in ob) {
  tgt[p] = ob[p + p];
}
