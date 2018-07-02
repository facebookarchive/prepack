var React = require("react");

function A(props) {
  return <div>Hello {props.x.b}</div>;
}

function B() {
  return <div>World</div>;
}

function C() {
  return "!";
}

function App() {
  var x = { a: 1, b: "World" };

  delete x.a;

  return (
    <div>
      <A x={x} />
      <B />
      <C />
    </div>
  );
}

App.getTrials = function(renderer, Root) {
  renderer.update(<Root />);
  return [["simple render with delete on props key", renderer.toJSON()]];
};

if (this.__optimizeReactComponentTree) {
  __optimizeReactComponentTree(App);
}

module.exports = App;
