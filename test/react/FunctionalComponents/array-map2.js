var React = require("react");

function A(props) {
  return <span>{props.title}</span>;
}

function App(props) {
  return <div>{Array.from(props.items, item => <A title={item.title} key={item.id} />)}</div>;
}

App.getTrials = function(renderer, Root) {
  let items = [{ title: "Hello world 1", id: 0 }, { title: "Hello world 2", id: 1 }, { title: "Hello world 3", id: 2 }];
  renderer.update(<Root items={items} />);
  return [["simple render array map", renderer.toJSON()]];
};

if (this.__optimizeReactComponentTree) {
  __optimizeReactComponentTree(App);
}

module.exports = App;
