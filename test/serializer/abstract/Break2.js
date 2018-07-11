// throws introspection error

let arr = [];

function foo() {
  let x = __abstract("boolean", "true");
  xyz: while (true) {
    arr[0] = 123;
    if (x) break;
    else break xyz;
  }
}

z = foo();
