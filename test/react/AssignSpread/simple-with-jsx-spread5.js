var React = require("react");

function App(props) {
  return <div {...props} />;
}

App.getTrials = function(renderer, Root) {
  var props = {};
  renderer.update(<Root {...props} />);
  return [["simple render with jsx spread 5", renderer.toJSON()]];
};

if (this.__optimizeReactComponentTree) {
  __optimizeReactComponentTree(App);
}

module.exports = App;
