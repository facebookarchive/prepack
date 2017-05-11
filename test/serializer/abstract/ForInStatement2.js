// throws introspection error
let x = __abstract("boolean", "true");
let ob = x ? { a: 1 } : { b: 2 };
let src = {};
let tgt = {};
for (var p in ob) {
  tgt[p] = src[p];
}
