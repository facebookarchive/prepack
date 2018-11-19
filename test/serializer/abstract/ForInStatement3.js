// throws introspection error
let ob = __abstract({}, "({})");
if (global.__makeSimple) __makeSimple(ob);
let x = __abstract("string");

ob[x] = 123;
let tgt = {};
for (var p in ob) {
  tgt[p] = ob[p];
}
