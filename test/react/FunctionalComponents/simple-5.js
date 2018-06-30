var React = require("react");
// the JSX transform converts to React, so we need to add it back in
this["React"] = React;

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
