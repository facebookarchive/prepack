var React = require("React");
// the JSX transform converts to React, so we need to add it back in
this["React"] = React;

if (!this.__evaluatePureFunction) {
  this.__evaluatePureFunction = function(f) {
    return f();
  };
}

__evaluatePureFunction(function() {
  var React = require("react");

  function App(props) {
    return React.createElement(React.Fragment, null, "123");
  }

  App.getTrials = function(renderer, Root) {
    renderer.update(<Root />);
    return [["fb22 mocks", renderer.toJSON()]];
  };

  if (this.__optimizeReactComponentTree) {
    __optimizeReactComponentTree(App, {
      firstRenderOnly: true,
    });
  }

  module.exports = App;
});
