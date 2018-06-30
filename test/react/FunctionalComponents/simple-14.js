var React = require("React");
// the JSX transform converts to React, so we need to add it back in
this["React"] = React;

function App(props) {
  var items = new Array(10);
  items[0] = "div";
  return React.createElement("div", null, items);
}

App.getTrials = function(renderer, Root) {
  renderer.update(<Root />);
  return [["hoely children", renderer.toJSON()]];
};

if (this.__optimizeReactComponentTree) {
  __optimizeReactComponentTree(App);
}

module.exports = App;
