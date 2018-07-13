var React = require("react");

function App(props) {
  var items = Array.from(props.items);

  var nested = function(item) {
    return item;
  };

  return items.map(nested);
}

App.getTrials = function(renderer, Root) {
  let items = [0, 0];
  renderer.update(<Root items={items} />);
  return [["simple render array map", renderer.toJSON()]];
};

if (this.__optimizeReactComponentTree) {
  __optimizeReactComponentTree(App);
}

module.exports = App;
