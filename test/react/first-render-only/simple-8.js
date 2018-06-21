var React = require('react');
// the JSX transform converts to React, so we need to add it back in
this['React'] = React;

function MyComponent(props) {
  return props.children.props.renderItem();
}

function App(props) {
  return (
    <MyComponent>
      <div renderItem={function() { return <p /> }} />
    </MyComponent>
  );
}

App.getTrials = function(renderer, Root) {
  renderer.update(<Root />);
  return [['simple render', renderer.toJSON()]];
};

if (this.__optimizeReactComponentTree) {
  __optimizeReactComponentTree(App, {
    firstRenderOnly: true,
  });
}

module.exports = App;