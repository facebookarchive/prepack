var React = require("React");

class MyComponent extends React.Component {
  render() {
    return <div>123</div>;
  }
}

MyComponent.getTrials = function(renderer, Root) {
  return [[`do not test the output, rather ensure test doesn't break`, true]];
};

if (this.__optimizeReactComponentTree) {
  __optimizeReactComponentTree(MyComponent);
}

module.exports = MyComponent;
