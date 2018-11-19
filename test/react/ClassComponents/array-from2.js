var React = require("react");

function A(props) {
  return (
    <span>
      {props.title} {props.foo}
    </span>
  );
}

class App extends React.Component {
  render() {
    let self = this;
    return (
      <div>
        {Array.from(this.props.items, function(item) {
          return <A title={item.title} key={item.id} foo={self.props.foo} />;
        })}
      </div>
    );
  }
}

App.getTrials = function(renderer, Root) {
  let items = [{ title: "Hello world 1", id: 0 }, { title: "Hello world 2", id: 1 }, { title: "Hello world 3", id: 2 }];
  renderer.update(<Root items={items} foo={123} />);
  return [["simple render array map", renderer.toJSON()]];
};

if (this.__optimizeReactComponentTree) {
  __optimizeReactComponentTree(App);
}

module.exports = App;
