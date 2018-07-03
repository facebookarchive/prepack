var React = require("react");

function A(props) {
  return <div>Hello {props.x}</div>;
}

function App(props) {
  var copyOfProps = Object.assign({}, props);
  return (
    <div>
      <A x={copyOfProps.x} />
    </div>
  );
}

App.getTrials = function(renderer, Root) {
  renderer.update(<Root x={10} />);
  return [["simple render with object assign", renderer.toJSON()]];
};

if (this.__optimizeReactComponentTree) {
  __optimizeReactComponentTree(App);
}

module.exports = App;
