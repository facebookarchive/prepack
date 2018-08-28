var React = require("react");

function Child() {
  return <div>This should be inlined</div>;
}

function App(props) {
  var a = props.x ? null : function() {};
  return a && <Child />;
}

App.getTrials = function(renderer, Root) {
  renderer.update(<Root />);
  return [["simple render", renderer.toJSON()]];
};

if (this.__optimizeReactComponentTree) {
  __optimizeReactComponentTree(App);
}

module.exports = App;
