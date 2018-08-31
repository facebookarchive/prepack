var React = require("react");

function Child(props) {
  return React.Children.map(props.children, function(child) {
    return <span>{child}</span>;
  });
}

function App() {
  return (
    <div>
      <Child>{[1, 2, 3]}</Child>
    </div>
  );
}

App.getTrials = function(renderer, Root) {
  renderer.update(<Root />);
  return [["simple conditions #3", renderer.toJSON()]];
};

if (this.__optimizeReactComponentTree) {
  __optimizeReactComponentTree(App);
}

module.exports = App;
