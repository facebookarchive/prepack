// throws introspection error
let x = __abstract("boolean", "true");

y = 1;

function f(b) {
  if (b) throw 1;
  y = 2;
}

z = f(!x);
