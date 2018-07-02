var x = 0;

function foo() {
  function foo2() {
    x++; // not safe
  }
  foo2();
}
function Bar() {
  foo();
  return null;
}

if (this.__optimizeReactComponentTree) {
  __optimizeReactComponentTree(Bar);
}
