// throws introspection error

var x = __abstract("object");
function foo() {
  for (var e of x) return e;
}
let p;
for ([p = foo()] of [[undefined]]) {
}
