var React = require("react");

class App extends React.Component {
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

App.getTrials = function(renderer, Root) {
  renderer.update(<Root />);
  return [["render with class with state", renderer.toJSON()]];
};

if (this.__optimizeReactComponentTree) {
  __optimizeReactComponentTree(App);
}

module.exports = App;
