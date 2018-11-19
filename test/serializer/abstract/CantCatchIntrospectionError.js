// throws introspection error
let x = __abstract("boolean", "true");

try {
  var obj = __abstract("object");
  if (x) delete obj.someProperty;
} catch (err) {
  throw new Error("Cannot catch");
} finally {
  throw new Error("Cannot finally");
}
