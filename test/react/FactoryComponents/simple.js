var React = require('react');
// the JSX transform converts to React, so we need to add it back in
this['React'] = React;

function FactoryComponent(props) {
  return {
    render() {
      return <div>{props.title}</div>;
    },
  }
}

FactoryComponent.getTrials = function(renderer, Root) {
  renderer.update(<Root />);
  return [['render simple factory classes', renderer.toJSON()]];
};

if (this.__optimizeReactComponentTree) {
  __optimizeReactComponentTree(FactoryComponent);
}

module.exports = FactoryComponent;