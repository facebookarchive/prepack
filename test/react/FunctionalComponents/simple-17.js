var React = require("React");

function App(props) {
  var externalFunc = props.externalFunc;

  var x = <span a="1" b="2" />;
  externalFunc(x);
  externalFunc(x.props);
  return <div>{x}</div>;
}

App.getTrials = function(renderer, Root) {
  function externalFunc() {
    // NO-OP
  }
  renderer.update(<Root externalFunc={externalFunc} />);
  return [["with havoc functions", renderer.toJSON()]];
};

if (this.__optimizeReactComponentTree) {
  __optimizeReactComponentTree(App);
}

module.exports = App;
