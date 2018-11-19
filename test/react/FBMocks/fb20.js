var React = require("React");

if (!this.__evaluatePureFunction) {
  this.__evaluatePureFunction = function(f) {
    return f();
  };
}

__evaluatePureFunction(function() {
  function URI() {}

  URI.prototype.method = function() {
    return 123;
  };

  function Child(props) {
    return props.children();
  }

  function App(props) {
    var obj = new URI();
    if (props.cond1) {
      return null;
    }
    if (props.cond2) {
      obj = new URI();
    }
    return (
      <Child>
        {function() {
          return obj.method();
        }}
      </Child>
    );
  }

  App.getTrials = function(renderer, Root) {
    renderer.update(<Root cond1={false} cond2={true} />);
    return [["fb20 mocks", renderer.toJSON()]];
  };

  if (this.__optimizeReactComponentTree) {
    __optimizeReactComponentTree(App, {
      firstRenderOnly: true,
    });
  }

  module.exports = App;
});
