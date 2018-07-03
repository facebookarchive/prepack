var React = require("React");

if (!this.__evaluatePureFunction) {
  this.__evaluatePureFunction = function(f) {
    return f();
  };
}

__evaluatePureFunction(function() {
  function FbtResult() {}
  FbtResult.prototype.$$typeof = Symbol.for("react.element");

  function fbt() {}
  function param() {}
  function plural(shouldThrow) {
    if (shouldThrow) {
      throw new Error("no");
    }
  }

  var React = require("react");

  function App(props) {
    return React.createElement("div", new FbtResult({}, [param(props.foo), plural(props.bar)]));
  }

  App.getTrials = function(renderer, Root) {
    renderer.update(<Root bar={false} />);
    return [["fb19 mocks", renderer.toJSON()]];
  };

  if (this.__optimizeReactComponentTree) {
    __optimizeReactComponentTree(App, {
      firstRenderOnly: true,
    });
  }

  module.exports = App;
});
