var React = require("react");

function App(props) {
  return (
    <div>
      {props.x}
      {this.y}
    </div>
  );
}

var foo = { y: " world" };
const BoundApp = App.bind(foo);

BoundApp.getTrials = function(renderer, Root) {
  renderer.update(<Root x={"Hello"} />);
  return [["simple bound function", renderer.toJSON()]];
};

if (this.__optimizeReactComponentTree) {
  __optimizeReactComponentTree(BoundApp);
}

module.exports = BoundApp;
