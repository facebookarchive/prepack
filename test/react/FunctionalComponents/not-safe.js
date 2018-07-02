var x = 0;

function foo() {
  x++; // not safe
}
function Bar() {
  foo();
  return null;
}

if (this.__optimizeReactComponentTree) {
  __optimizeReactComponentTree(Bar);
}
