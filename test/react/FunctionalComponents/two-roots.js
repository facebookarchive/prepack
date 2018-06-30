function A(props) {
  return props.toString();
}

function B(props) {
  return props.toString();
}

if (this.__optimizeReactComponentTree) {
  __optimizeReactComponentTree(A);
  __optimizeReactComponentTree(B);
}

this.A = A;
this.B = B;
