var React = require("react");
// the JSX transform converts to React, so we need to add it back in
this["React"] = React;

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
