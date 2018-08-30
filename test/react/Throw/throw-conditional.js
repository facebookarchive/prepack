const React = require("react");

function MyComponent(props) {
  if (props.b) throw new Error("abrupt");
  return 42;
}

if (global.__optimizeReactComponentTree) global.__optimizeReactComponentTree(MyComponent);

MyComponent.getTrials = renderer => {
  renderer.update(<MyComponent b={false} />);
  return [["simple render", renderer.toJSON()]];
};

module.exports = MyComponent;
