var React = require("react");

function Foo() {
  return <div>123</div>;
}

function App(props) {
  return <div>{props.yar ? <Foo arg={1} /> : <Foo arg={2} />}</div>;
}

App.getTrials = function(renderer, Root) {
  renderer.update(<Root />);
  let childKey = renderer.toTree().rendered.props.children.key;
  return [["no added keys to child components", childKey]];
};

if (this.__optimizeReactComponentTree) {
  __optimizeReactComponentTree(App);
}

module.exports = App;
