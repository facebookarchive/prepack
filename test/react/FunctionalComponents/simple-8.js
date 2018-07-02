var React = require("react");

let lazyVariable = null;

function A(props) {
  if (!lazyVariable) {
    lazyVariable = 123;
  }
  return <div>Hello {lazyVariable}</div>;
}

function App() {
  return (
    <div>
      <A />
      <A />
      <A />
    </div>
  );
}

App.getTrials = function(renderer, Root) {
  renderer.update(<Root />);
  return [["simple render", renderer.toJSON()]];
};

if (this.__optimizeReactComponentTree) {
  __optimizeReactComponentTree(App);
}

module.exports = App;
