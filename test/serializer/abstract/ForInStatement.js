// throws introspection error
let x = __abstract("boolean", "true");
let ob = { a: 1 };
if (x) {
  delete ob.a;
}
for (var p in ob) {
  console.log(p);
}
