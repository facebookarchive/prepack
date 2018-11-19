var React = require("react");

function Child(props) {
  return (
    <div>
      {props.x}
      {this.y}
    </div>
  );
}

var foo = { y: " world" };
const BoundChild = Child.bind(foo);

function App(props) {
  return <BoundChild x={props.x} />;
}

App.getTrials = function(renderer, Root) {
  renderer.update(<Root />);
  return [["simple bound function", renderer.toJSON()]];
};

if (this.__optimizeReactComponentTree) {
  __optimizeReactComponentTree(App);
}

module.exports = App;
