var React = require("react");

class Child extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      title: "It works!",
    };
  }
  render() {
    return <div>{this.state.title}</div>;
  }
}

function App() {
  return <Child />;
}

App.getTrials = function(renderer, Root) {
  renderer.update(<Root />);
  return [["simple render 4", renderer.toJSON()]];
};

if (this.__optimizeReactComponentTree) {
  __optimizeReactComponentTree(App);
}

module.exports = App;
