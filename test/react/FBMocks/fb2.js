var React = require("React");

var obj = { a: 1, b: 2, c: 3 };

// FB www class transform output
const _React$Component = babelHelpers.inherits(Hello, React.Component);
Hello.prototype.componentDidMount = function() {
  // keep the lifecycle to prevent functional conversion
};
Hello.prototype.render = function() {
  return React.createElement(
    "h1",
    // Regression test for bad serialization of computed properties
    babelHelpers["extends"]({}, this.__unknownAbstract),
    "Hello world",
    Object.keys(babelHelpers.objectWithoutProperties(obj, ["a", "c"]))
  );
};
function Hello() {
  _React$Component.apply(this, arguments);
}

Hello.getTrials = function(renderer, Root) {
  renderer.update(<Root />);
  return [["fb2 mocks", renderer.toJSON()]];
};

if (window.__optimizeReactComponentTree) {
  __optimizeReactComponentTree(Hello);
}

module.exports = Hello;
