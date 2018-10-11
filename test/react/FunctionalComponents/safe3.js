function Bar(props) {
  if (props.arg) return undefined;
  let f = 42;
  return f;
}

if (this.__optimizeReactComponentTree) {
  __optimizeReactComponentTree(Bar);
}
