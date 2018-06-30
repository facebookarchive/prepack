var React = require("react");
// the JSX transform converts to React, so we need to add it back in
this["React"] = React;

let lazyVariable = null;

function A(props) {
  if (!lazyVariable) {
    lazyVariable = props.x;
  }
  return <div>Hello {lazyVariable}</div>;
}

function App(props) {
  return (
    <div>
      <A {...props} />
      <A {...props} />
      <A {...props} />
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
