var React = require("react");

function Child() {
  return <div>This should be inlined</div>;
}

function Child2() {
  return <span>This should be inlined too</span>;
}

function App(props) {
  var a = props.x ? null : <Child2 />;
  return a && <Child />;
}

App.getTrials = function(renderer, Root) {
  renderer.update(<Root />);
  return [["simple conditions", renderer.toJSON()]];
};

if (this.__optimizeReactComponentTree) {
  __optimizeReactComponentTree(App);
}

module.exports = App;
