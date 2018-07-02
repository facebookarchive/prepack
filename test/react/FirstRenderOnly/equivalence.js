var React = require('react');

function App(props) {
  function f() {}
  var foo3 = Object.assign({}, props);
  var a = <span {...foo3} key={null} />
  var b = <span {...foo3} key={null} />
  return [a, b]
}

App.getTrials = function(renderer, Root, data, isCompiled) {
  if (isCompiled) {
    console.log(isCompiled)
    const [a, b] = App({});
    if (a !== b) {
      throw new Error("Equivalence check failed")
    }
  }
  renderer.update(<Root />);
  return [['equivalence render', renderer.toJSON()]];
};

if (this.__optimizeReactComponentTree) {
  __optimizeReactComponentTree(App, {
    firstRenderOnly: true,
  });
}

module.exports = App;