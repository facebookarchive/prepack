var React = require("react");

class Child extends React.Component {
  constructor() {
    super();
    this.state = {
      id: 5,
    };
  }
  render() {
    return <span>{this.state.id}</span>;
  }
}

function App() {
  return (
    <div>
      <Child />
    </div>
  );
}

App.getTrials = function(renderer, Root) {
  renderer.update(<Root />);
  return [["simple render", renderer.toJSON()]];
};

if (this.__optimizeReactComponentTree) {
  __optimizeReactComponentTree(App);
}

if (this.__optimizeReactComponentTree) {
  __optimizeReactComponentTree(Child);
}

module.exports = App;
