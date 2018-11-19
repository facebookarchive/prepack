var React = require("react");

function App(props) {
  var foo = Object.assign({}, props);

  if (props.x) {
    return <span {...foo} key={null} />;
  } else {
    return <span {...foo} key={null} />;
  }
}

App.getTrials = function(renderer, Root, data, isCompiled) {
  renderer.update(<Root x={false} className={"test"} />);
  return [["equivalence render", renderer.toJSON()]];
};

if (this.__optimizeReactComponentTree) {
  __optimizeReactComponentTree(App, {
    firstRenderOnly: true,
  });
}

module.exports = App;
