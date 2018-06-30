var React = require("React");
// the JSX transform converts to React, so we need to add it back in
this["React"] = React;

function App(props) {
  return <div children={"hi"}>{undefined}</div>;
}

App.getTrials = function(renderer, Root) {
  renderer.update(<Root />);
  return [["undefined children", renderer.toJSON()]];
};

if (this.__optimizeReactComponentTree) {
  __optimizeReactComponentTree(App);
}

module.exports = App;
