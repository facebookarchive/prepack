var React = require('react');
// the JSX transform converts to React, so we need to add it back in
this['React'] = React;

function Child(props) {
  return <div ref={props.forwardedRef} />;
}

const WrappedComponent = React.forwardRef((props, ref) => {
  return <Child {...props} forwardedRef={ref} />;
});

function App() {
  var x = React.createRef();

  return (
    <WrappedComponent ref={x} />
  );
}

App.getTrials = function(renderer, Root) {
  renderer.update(<Root />);
  return [['simple render with refs', renderer.toJSON()]];
};

if (this.__optimizeReactComponentTree) {
  __optimizeReactComponentTree(App);
}

module.exports = App;