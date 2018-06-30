var React = require("react");

// the JSX transform converts to React, so we need to add it back in
this["React"] = React;

function Child() {
  return [<span key="a" />, <span key="b" />];
}

function App() {
  return (
    <div>
      <span />
      <Child />
      <Child />
      <span />
    </div>
  );
}

App.getTrials = function(renderer, Root) {
  renderer.update(<Root />);
  return [["key nesting 2", renderer.toJSON()]];
};

if (this.__optimizeReactComponentTree) {
  __optimizeReactComponentTree(App);
}

module.exports = App;
