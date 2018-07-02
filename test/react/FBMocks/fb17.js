var React = require("React");

if (!this.__evaluatePureFunction) {
  this.__evaluatePureFunction = function(f) {
    return f();
  };
}

__evaluatePureFunction(function() {
  function Inner(props) {
    return props.children();
  }

  function Middle(props) {
    var bar = props.bar;
    if (!bar) {
      return null;
    }
    return props.children();
  }

  function Outer(props) {
    return React.createElement(
      Middle,
      {
        bar: props.foo,
      },
      function() {
        return React.createElement(Inner, props);
      }
    );
  }

  function App(props) {
    return React.createElement(
      Outer,
      {
        foo: props.foo,
      },
      function() {
        return null;
      }
    );
  }

  App.getTrials = function(renderer, Root) {
    renderer.update(<Root foo={true} />);
    return [["fb17 mocks", renderer.toJSON()]];
  };

  if (this.__optimizeReactComponentTree) {
    __optimizeReactComponentTree(App, {
      firstRenderOnly: true,
    });
  }

  module.exports = App;
});
