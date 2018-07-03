var React = require("react");

function SubChild(props) {
  return <span>{props.title}</span>;
}

function Child(props) {
  return (
    <span>
      <SubChild title={props.title} />
    </span>
  );
}

class App extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      title: "It works!",
    };
  }
  render() {
    return <Child title={this.state.title} />;
  }
}

App.getTrials = function(renderer, Root) {
  renderer.update(<Root />);
  return [["render with class root and props", renderer.toJSON()]];
};

if (this.__optimizeReactComponentTree) {
  __optimizeReactComponentTree(App);
}

module.exports = App;
