var React = require("react");

function URI(other) {
  if (!other) {
    return;
  }
  if (other.foo) {
    if (other.baz) {
      throw new Error();
    }
    this.bar = other;
    throw new Error();
  }
  throw new Error();
}

function App(props) {
  var first = new URI(props.initial);
  return React.createElement(Child, null, function() {
    new URI(first.bar);
    return null;
  });
}

function Child(props) {
  var children = props.children;
  return children();
}

if (this.__optimizeReactComponentTree) __optimizeReactComponentTree(App);

App.getTrials = function(renderer, Root) {
  // Just compile, don't run
  return [];
};

module.exports = App;
