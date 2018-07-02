var React = require("react");

function Child(props) {
  return <div ref={props.forwardedRef} />;
}

const WrappedComponent = React.forwardRef((props, ref) => {
  return <Child {...props} forwardedRef={ref} />;
});

function App(props) {
  return <WrappedComponent ref={props.x} />;
}

App.getTrials = function(renderer, Root) {
  let results = [];
  var refValue = null;
  renderer.update(<Root x={val => (refValue = val)} />);
  results.push(["simple render with refs", renderer.toJSON()]);
  results.push(["ref node is of div", refValue.type]);
  return results;
};

if (this.__optimizeReactComponentTree) {
  __optimizeReactComponentTree(App);
}

module.exports = App;
