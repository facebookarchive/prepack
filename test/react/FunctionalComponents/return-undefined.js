var React = require("react");

function A() {}

function App() {
  return (
    <div>
      <A />
    </div>
  );
}

App.getTrials = function(renderer, Root) {
  let didError = false;
  try {
    renderer.update(<Root />);
  } catch (err) {
    didError = true;
  }
  return [["error rendering", didError]];
};

if (this.__optimizeReactComponentTree) {
  __optimizeReactComponentTree(App);
}

module.exports = App;
