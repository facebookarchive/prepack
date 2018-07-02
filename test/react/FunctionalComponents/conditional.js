var React = require("react");

function MaybeShow(props) {
  if (props.show) {
    return props.children;
  }
  return null;
}

function App() {
  return (
    <MaybeShow show={true}>
      <h1>Hi</h1>
    </MaybeShow>
  );
}

App.getTrials = function(renderer, Root) {
  renderer.update(<Root />);
  return [["conditional render", renderer.toJSON()]];
};

if (this.__optimizeReactComponentTree) {
  __optimizeReactComponentTree(App);
}

module.exports = App;
