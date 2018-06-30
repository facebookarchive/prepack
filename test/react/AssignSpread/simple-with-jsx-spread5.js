var React = require("react");
// the JSX transform converts to React, so we need to add it back in
this["React"] = React;

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
