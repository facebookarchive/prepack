require("react");

__evaluatePureFunction(function() {
  var React = require("react");

  function URI(arg) {
    if (arg instanceof URI) {
      arg.foo();
    }
    if ({}.hasOwnProperty(arg)) {
      return;
    }
    return URI();
  }

  function App(props) {
    var arg = "http://hi/" + props.x;
    var href;
    if (URI(arg)) {
      href = URI(arg);
    } else {
      href = URI("#");
    }
    return React.createElement("a");
  }

  __optimizeReactComponentTree(App, {
    firstRenderOnly: true,
  });

  module.exports = App;
});
