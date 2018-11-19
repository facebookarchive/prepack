var React = require("react");

function App(props) {
  return <div {...props.inner} />;
}

App.getTrials = function(renderer, Root) {
  renderer.update(<Root inner={{ className: "foo" }} />);
  return [["simple render with jsx spread 6", renderer.toJSON()]];
};

if (this.__optimizeReactComponentTree) {
  __optimizeReactComponentTree(App);
}

module.exports = App;
