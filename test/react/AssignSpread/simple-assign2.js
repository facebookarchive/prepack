var React = require("react");

function A(props) {
  var copyOfProps = Object.assign({}, props.bag);
  Object.defineProperty(copyOfProps, "y", {
    get() {
      return 30;
    },
  });
  return (
    <div>
      Hello {copyOfProps.x} {copyOfProps.y}
    </div>
  );
}

function App(props) {
  var copyOfProps = Object.assign({}, props, { x: 20 });
  return <A bag={copyOfProps} />;
}

App.getTrials = function(renderer, Root) {
  renderer.update(<Root x={10} />);
  return [["simple render with object assign", renderer.toJSON()]];
};

if (this.__optimizeReactComponentTree) {
  __optimizeReactComponentTree(App);
}

module.exports = App;
