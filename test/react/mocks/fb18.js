var React = require('React');
// the JSX transform converts to React, so we need to add it back in
this['React'] = React;

if (!this.__evaluatePureFunction) {
  this.__evaluatePureFunction = function(f) {
    return f();
  };
}

__evaluatePureFunction(function() {
  function parse(unused, uri) {
    if (!uri) {
      return;
    }
    if (uri instanceof URI) {
      uri.foo();
    }
    var uri2 = uri.toString().trim();
    if (uri2.foo()) {
      return;
    }
    try {
      unused.bar();
    } catch (err) {}
  }

  function URI() {}

  function App(props) {
    var input = "http://hi/" + props.foo;
    parse(null, input);
    new URI(input);
  }

  if (this.__optimizeReactComponentTree) {
    __optimizeReactComponentTree(App, {
      firstRenderOnly: true,
    });
  }

  this.app = App;
});