function foo() {
  var x = 0;
  function foo2() {
    x++; // safe
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
