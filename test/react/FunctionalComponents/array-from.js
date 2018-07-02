var React = require("react");

function App(props) {
  var _ref8;
  var value =
    (_ref8 = props.feedback) != null ? ((_ref8 = _ref8.display_comments) != null ? _ref8.ordering_mode : _ref8) : _ref8;

  var items = props.items;
  var collection = Array.from(items).map(function() {
    return <span>{value}</span>;
  });

  return <div>{collection}</div>;
}

App.getTrials = function(renderer, Root) {
  let items = [{ title: "Hello world 1", id: 0 }, { title: "Hello world 2", id: 1 }, { title: "Hello world 3", id: 2 }];
  renderer.update(<Root items={items} feedback={{ display_comments: { ordering_mode: 10 } }} />);
  return [["simple render array map", renderer.toJSON()]];
};

if (this.__optimizeReactComponentTree) {
  __optimizeReactComponentTree(App);
}

module.exports = App;
