// throws introspection error
let x = __abstract("boolean", "true");
let ob = { a: 1 };
if (x) {
  delete ob.a;
}
let keys = Reflect.ownKeys(ob);
console.log(keys[0]);
