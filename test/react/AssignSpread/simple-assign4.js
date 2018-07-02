var React = require("react");

function App(props) {
  var obj = Object.assign({}, { x: 20 }, props);
  return <div>{obj.x}</div>;
}

App.getTrials = function(renderer, Root) {
  renderer.update(<Root x={10} />);
  return [["simple render with object assign", renderer.toJSON()]];
};

if (this.__optimizeReactComponentTree) {
  __optimizeReactComponentTree(App);
}

module.exports = App;
