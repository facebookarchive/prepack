var React = require("react");

function App() {
  var x = undefined;
  x.push();
}

App.getTrials = function(renderer, Root) {
  renderer.update(<Root />);
  return [["runtime error", renderer.toJSON()]];
};

if (this.__optimizeReactComponentTree) {
  __optimizeReactComponentTree(App);
}

module.exports = App;
