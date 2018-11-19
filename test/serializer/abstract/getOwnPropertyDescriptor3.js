// throws introspection error
let x = __abstract("boolean", "true");
let ob = { a: 1 };
if (x) {
  delete ob.a;
}
let desc = Object.getOwnPropertyDescriptor(ob, "a");
console.log(JSON.stringify(desc));
