var React = require("React");

function Child() {
  return <div>{[1, 2, 3]}</div>;
}

Child.__reactCompilerDoNotOptimize = true;

function App() {
  return <Child />;
}

App.getTrials = function(renderer, Root) {
  renderer.update(<Root />);
  var render = renderer.toJSON();
  return [["do not optimize", render.children.length]];
};

if (this.__optimizeReactComponentTree) {
  __optimizeReactComponentTree(App, {
    firstRenderOnly: true,
  });
}

module.exports = App;
