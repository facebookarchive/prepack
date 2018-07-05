var React = require("react");

function App(props) {
  var foo = Object.assign({}, props);
  var a = <span {...foo} key={null} />;
  var b = <span {...foo} key={null} />;
  return [a, b];
}

App.getTrials = function(renderer, Root, data, isCompiled) {
  if (isCompiled) {
    const [a, b] = Root({});
    if (a !== b) {
      throw new Error("Equivalence check failed");
    }
  }
  renderer.update(<Root />);
  return [["equivalence render", renderer.toJSON()]];
};

if (this.__optimizeReactComponentTree) {
  __optimizeReactComponentTree(App, {
    firstRenderOnly: true,
  });
}

module.exports = App;
