var React = require("react");

function Button(props) {
  return <div {...props} />;
}

Button.defaultProps = {
  id: "Dominic",
};

function App(props) {
  return <Button {...props} children="Hello world" />;
}

App.getTrials = function(renderer, Root) {
  renderer.update(<Root className="div-thing" />);
  return [["simple render with jsx spread 3", renderer.toJSON()]];
};

if (this.__optimizeReactComponentTree) {
  __optimizeReactComponentTree(App);
}

module.exports = App;
