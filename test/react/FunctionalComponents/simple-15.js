var React = require("React");

function App(props) {
  return React.createElement("div", null, [, , , , , , "div"]);
}

App.getTrials = function(renderer, Root) {
  renderer.update(<Root />);
  return [["hoely children #2", renderer.toJSON()]];
};

if (this.__optimizeReactComponentTree) {
  __optimizeReactComponentTree(App);
}

module.exports = App;
