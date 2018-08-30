var React = require("react");

function App(props) {
  var a = <div className="123" />;
  return React.cloneElement(a, { id: "456" }, "Hello world!");
}

App.getTrials = function(renderer, Root) {
  renderer.update(<Root />);
  return [["clone element 2", renderer.toJSON()]];
};

if (this.__optimizeReactComponentTree) {
  __optimizeReactComponentTree(App);
}

module.exports = App;
