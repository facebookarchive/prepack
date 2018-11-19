// throws introspection error
let x = __abstract("boolean", "true");
let ob = { a: 1 };
if (x) {
  delete ob.a;
}
z = "a" in ob;
