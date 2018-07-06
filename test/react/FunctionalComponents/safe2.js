function foo() {
  var x = 0;
  function foo2() {
    function foo3() {
      x++; // safe
    }
    foo3();
  }
  foo2();
}
function Bar() {
  foo();
}

if (this.__optimizeReactComponentTree) {
  __optimizeReactComponentTree(Bar);
}
