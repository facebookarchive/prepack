var React = require("react");
// the JSX transform converts to React, so we need to add it back in
this["React"] = React;

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
