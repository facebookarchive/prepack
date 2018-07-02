var React = require("react");

function Component2() {
  // nothing here
}

function App() {
  return (
    <div
      ref={() => {
        var foo = <Component2 />;
      }}
    />
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
