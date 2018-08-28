var React = require("react");

function App(props) {
  if (props.neverHappens) {
    return <Bad />;
  }
  return null;
}

function Bad() {
  return {}; // Invalid
}
App.getTrials = function(renderer, Root) {
  renderer.update(<Root />);
  return [["simple conditions #3", renderer.toJSON()]];
};

if (this.__optimizeReactComponentTree) {
  __optimizeReactComponentTree(App);
}

module.exports = App;
