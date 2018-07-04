var React = require("react");

function App(props) {
  var foo = props.foo;
  var x = {
    val: 1,
  };
  var y = {
    val: 1,
  };
  var foo = Object.assign({}, props, foo ? x : y);
  var a = <span {...foo} key={null} />;
  var b = <span {...foo} key={null} />;
  return [a, b];
}

App.getTrials = function(renderer, Root, data, isCompiled) {
  if (isCompiled) {
    const [a, b] = Root({ foo: false });
    if (a !== b) {
      throw new Error("Equivalence check failed");
    }
  }
  renderer.update(<Root foo={false} />);
  return [["equivalence render", renderer.toJSON()]];
};

if (this.__optimizeReactComponentTree) {
  __optimizeReactComponentTree(App, {
    firstRenderOnly: true,
  });
}

module.exports = App;
