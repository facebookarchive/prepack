// throws introspection error

let x = __abstract("boolean", "true");

try {
  if (x) z = "is true"; else throw "is false";  
} catch (e) {
  z = e;
}
