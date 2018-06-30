var React = require("react");
// the JSX transform converts to React, so we need to add it back in
this["React"] = React;

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
