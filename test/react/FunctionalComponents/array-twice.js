var React = require("react");

function A(props) {
  return (
    <div>
      {props.children}
      {props.children}
    </div>
  );
}

function App() {
  return (
    <div>
      <A>{["hello"]}</A>
    </div>
  );
}

App.getTrials = function(renderer, Root) {
  renderer.update(<Root />);
  return [["render array twice", renderer.toJSON()]];
};

if (this.__optimizeReactComponentTree) {
  __optimizeReactComponentTree(App);
}

module.exports = App;
