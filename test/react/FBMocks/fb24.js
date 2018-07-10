var React = require("react");

function App(props) {
  var data = {};
  var someProps = Object.assign(data, props, {
    text: "Text!",
  });
  var propsWithout = babelHelpers.objectWithoutProperties(data, []);
  return <div>{propsWithout.text}</div>;
}

App.getTrials = function(renderer, Root, data, isCompiled) {
  if (isCompiled) {
    var a = App({});
    var b = App({});
    if (a !== b) {
      throw new Error("The values should be the same!");
    }
  }
  renderer.update(<Root />);
  return [["fb24", renderer.toJSON()]];
};

if (this.__optimizeReactComponentTree) {
  __optimizeReactComponentTree(App);
}

module.exports = App;
