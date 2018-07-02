var React = require("React");

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
