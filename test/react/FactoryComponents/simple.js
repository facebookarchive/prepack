var React = require("react");

function FactoryComponent(props) {
  return {
    render() {
      return <div>{props.title}</div>;
    },
  };
}

FactoryComponent.getTrials = function(renderer, Root) {
  renderer.update(<Root />);
  return [["render simple factory classes", renderer.toJSON()]];
};

if (this.__optimizeReactComponentTree) {
  __optimizeReactComponentTree(FactoryComponent);
}

module.exports = FactoryComponent;
