var React = require("react");

class App extends React.Component {
  render() {
    return <div>Hello world</div>;
  }
}

App.getTrials = function(renderer, Root) {
  renderer.update(<Root />);
  return [["render simple classes", renderer.toJSON()]];
};

if (this.__optimizeReactComponentTree) {
  __optimizeReactComponentTree(App);
}

module.exports = App;
