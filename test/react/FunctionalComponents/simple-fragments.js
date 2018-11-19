var React = require("react");

function A(props) {
  return <div>Hello {props.x}</div>;
}

function B() {
  return <div>World</div>;
}

function C() {
  return "!";
}

function App() {
  return (
    <React.Fragment>
      <A x={42} />
      <B />
      <C />
    </React.Fragment>
  );
}

App.getTrials = function(renderer, Root) {
  renderer.update(<Root />);
  return [["simple fragments render", renderer.toJSON()]];
};

if (this.__optimizeReactComponentTree) {
  __optimizeReactComponentTree(App);
}

module.exports = App;
