var React = require("react");

let lazyVariable = null;

function A(props) {
  if (!lazyVariable) {
    lazyVariable = 123;
  }
  return <div>Hello {lazyVariable}</div>;
}

function App(props) {
  if (props.x) {
    throw new Error("I am an error");
  }
  return (
    <div>
      <A />
    </div>
  );
}

function App2(props) {
  if (props.x) {
    throw new Error("I am an error");
  }
  return (
    <div>
      <A />
    </div>
  );
}

// keep a reference to the other root that also
// writes to the same variable
App.App2 = App2;

App.getTrials = function(renderer, Root) {
  renderer.update(<Root />);
  return [["simple render", renderer.toJSON()]];
};

if (this.__optimizeReactComponentTree) {
  __optimizeReactComponentTree(App);
  __optimizeReactComponentTree(App2);
}

module.exports = App;
