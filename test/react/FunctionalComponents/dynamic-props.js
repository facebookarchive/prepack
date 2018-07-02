var React = require("react");

function Fn(props) {
  return <div>Hello {props[props.dynamicKey]}</div>;
}

function App(props) {
  return <Fn foo="World" dynamicKey={props.dynamicKey} />;
}

App.getTrials = function(renderer, Root) {
  renderer.update(<Root dynamicKey="foo" />);
  return [["render with dynamic prop access", renderer.toJSON()]];
};

if (this.__optimizeReactComponentTree) {
  __optimizeReactComponentTree(App);
}

module.exports = App;
