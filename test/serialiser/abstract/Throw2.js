// throws introspection error

let x = __abstract("boolean", "true");

try {
  if (x) throw "is true";
  z = "is false";
} catch (e) {
  z = e;
}
