const React = require("react");

class Child extends React.Component {
  constructor() {
    super();
    this.state = {
      a: 1,
    };
  }
  render() {
    if (this.props.x === 5) {
      return <span>{this.state.a}</span>;
    } else {
      return <span>Hello world</span>;
    }
  }
}

class App extends React.Component {
  render() {
    return (
      <div>
        <Child x={10} />
      </div>
    );
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
