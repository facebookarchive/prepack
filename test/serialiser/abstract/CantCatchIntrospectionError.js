// throws introspection error

try {
  var obj = __abstract("object");
  delete obj.someProperty;
} catch(err) {
  throw new Error("Cannot catch");
} finally {
  throw new Error("Cannot finally");
}
