// throws introspection error
let x = __abstract("boolean", "true")

y = 1;
y1 = 2;

function f(b) {
  y = 2;
  if (b) {} else return 0;
  y1 = 3;
  if (x) {
    return 1;
  } else {
    throw 2;
  }
}

z = f(!x);
